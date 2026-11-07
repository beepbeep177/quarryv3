import { describe, expect, it } from 'vitest';
import {
  computeTimecard,
  dedupePunches,
  groupPunchesByWorkDate,
  minutesToLabel,
  nightMinutes,
  parsePunchTimestamp,
  roundOtHours,
} from './timecard';
import { DEFAULT_PAY_RULES, type EmployeeRule, type Holiday, type ShiftRule } from './types';

const DAY_SHIFT: ShiftRule = {
  id: 'day',
  name: 'Day 7AM-4PM',
  startTime: '07:00',
  endTime: '16:00',
  breakStart: '12:00',
  breakMinutes: 60,
  halfDayMinHours: 5,
  otRounding: 'nearest_hour',
  crossesMidnight: false,
};

const NIGHT_SHIFT: ShiftRule = {
  ...DAY_SHIFT,
  id: 'night',
  name: 'Night 7PM-4AM',
  startTime: '19:00',
  endTime: '04:00',
  breakStart: '00:00',
  crossesMidnight: true,
};

const WORKER: EmployeeRule = { id: 'synthetic', payType: 'daily', otEligible: true, shift: DAY_SHIFT };

function day(punches: string[], options: { employee?: EmployeeRule; date?: string } = {}) {
  const date = options.date ?? '2026-10-05';
  const card = computeTimecard({
    employee: options.employee ?? WORKER,
    punches: punches.map(time => `${date} ${time}`),
    dateFrom: date,
    dateTo: date,
    rules: DEFAULT_PAY_RULES,
    holidays: [],
    overrides: [],
  });
  return card.days[0];
}

describe('client fixture cases (Day shift, nearest-hour rounding)', () => {
  it.each([
    { punches: ['06:47', '19:11'], days: 1, ot: 3, nd: 0, note: 'early arrival earns nothing' },
    { punches: ['07:37', '16:56'], days: 1, ot: 0, nd: 0, note: 'late: OT starts 16:37' },
    { punches: ['07:01', '11:59'], days: 0.5, ot: 0, nd: 0, note: 'under 5 hours' },
    { punches: ['07:59', '17:33'], days: 1, ot: 1, nd: 0, note: '34 min rounds to 1 hour' },
    { punches: ['15:41', '23:56'], days: 1, ot: 0, nd: 2, note: 'ND from 21:00, whole hours only' },
    { punches: ['07:37', '23:54'], days: 1, ot: 7, nd: 2, note: 'long day' },
  ])('$punches.0 -> $punches.1: $days day, $ot OT, $nd ND ($note)', ({ punches, days, ot, nd }) => {
    const result = day(punches);
    expect(result.exception).toBeNull();
    expect(result.daysCredit).toBe(days);
    expect(result.otHours).toBe(ot);
    expect(result.ndHours).toBe(nd);
  });

  it('collapses 07:05, 07:06, 17:24 to two punches', () => {
    const result = day(['07:05', '07:06', '17:24']);
    expect(result.punchMinutes.map(minutesToLabel)).toEqual(['07:05', '17:24']);
    expect(result.rawPunchCount).toBe(3);
    expect(result.exception).toBeNull();
    expect(result.daysCredit).toBe(1);
  });

  it('flags a single punch as an exception with no credit', () => {
    const result = day(['06:56']);
    expect(result.exception).toBe('single_punch');
    expect(result.daysCredit).toBe(0);
  });
});

describe('timecard rules', () => {
  it('credits zero for an odd punch count until overridden, but keeps the computed suggestion', () => {
    const result = day(['07:00', '12:00', '16:00']);
    expect(result.exception).toBe('missing_out_punch');
    expect(result.daysCredit).toBe(0);
    expect(result.computed.daysCredit).toBe(1);
  });

  it('flags punches for an employee without a shift', () => {
    const result = day(['07:00', '16:00'], { employee: { ...WORKER, shift: null } });
    expect(result.exception).toBe('no_shift');
    expect(result.daysCredit).toBe(0);
  });

  it('deducts the break only for the part of the lunch window that was covered', () => {
    expect(day(['07:00', '13:30']).workedMinutes).toBe(330);
    expect(day(['07:00', '12:30']).workedMinutes).toBe(300);
    expect(day(['07:00', '11:00']).workedMinutes).toBe(240);
  });

  it('records lateness for information only', () => {
    const result = day(['07:37', '16:56']);
    expect(result.lateMinutes).toBe(37);
    expect(result.daysCredit).toBe(1);
  });

  it('gives no OT to employees who are not OT eligible', () => {
    expect(day(['06:47', '19:11'], { employee: { ...WORKER, otEligible: false } }).otHours).toBe(0);
  });

  it('applies overrides over computed values and clears the exception count', () => {
    const card = computeTimecard({
      employee: WORKER,
      punches: ['2026-10-05 06:56'],
      dateFrom: '2026-10-05',
      dateTo: '2026-10-05',
      rules: DEFAULT_PAY_RULES,
      holidays: [],
      overrides: [{ workDate: '2026-10-05', daysCredit: 1, otHours: null, ndHours: null, reason: 'Forgot to punch out' }],
    });
    expect(card.days[0].daysCredit).toBe(1);
    expect(card.days[0].otHours).toBe(0);
    expect(card.summary.exceptions).toBe(0);
  });

  it.each([
    ['nearest_hour', 89, 1],
    ['nearest_hour', 90, 2],
    ['floor_hour', 119, 1],
    ['floor_half_hour', 100, 1.5],
    ['exact', 100, 1.67],
  ] as const)('%s rounds %i minutes to %f hours', (rounding, minutes, hours) => {
    expect(roundOtHours(minutes, rounding)).toBe(hours);
  });

  it('counts night minutes across midnight and the early-morning window', () => {
    expect(nightMinutes(20 * 60, 26 * 60, DEFAULT_PAY_RULES)).toBe(300);
    expect(nightMinutes(4 * 60, 8 * 60, DEFAULT_PAY_RULES)).toBe(120);
  });

  it('dedupes against the last kept punch', () => {
    expect(dedupePunches([0, 4, 8, 20], 5)).toEqual([0, 8, 20]);
  });
});

describe('night shifts', () => {
  const nightWorker: EmployeeRule = { ...WORKER, shift: NIGHT_SHIFT };

  it('assigns early-morning punches to the previous work date', () => {
    const { grouped } = groupPunchesByWorkDate(
      ['2026-10-05 18:55', '2026-10-06 04:10'].map(parsePunchTimestamp),
      NIGHT_SHIFT,
      5,
    );
    expect([...grouped.keys()]).toEqual(['2026-10-05']);
    expect(grouped.get('2026-10-05')!.map(minutesToLabel)).toEqual(['18:55', '04:10 (+1)']);
  });

  it('computes a full night with ND', () => {
    const card = computeTimecard({
      employee: nightWorker,
      punches: ['2026-10-05 18:55', '2026-10-06 04:10'],
      dateFrom: '2026-10-05',
      dateTo: '2026-10-06',
      rules: DEFAULT_PAY_RULES,
      holidays: [],
      overrides: [],
    });
    expect(card.days[0]).toMatchObject({ daysCredit: 1, otHours: 0, ndHours: 7, exception: null });
    expect(card.days[1].daysCredit).toBe(0);
  });
});

describe('period summary', () => {
  const holidays: Holiday[] = [
    { date: '2026-10-02', name: 'Synthetic regular holiday', type: 'regular' },
    { date: '2026-10-03', name: 'Synthetic special day', type: 'special' },
  ];

  function period(employee: EmployeeRule, punches: string[]) {
    return computeTimecard({
      employee,
      punches,
      dateFrom: '2026-10-01',
      dateTo: '2026-10-07',
      rules: DEFAULT_PAY_RULES,
      holidays,
      overrides: [],
    }).summary;
  }

  it('totals days, OT, ND and holidays like the client attendance sheet', () => {
    const summary = period(WORKER, [
      '2026-10-01 06:47', '2026-10-01 19:11',
      '2026-10-02 07:00', '2026-10-02 16:00',
      '2026-10-03 07:01', '2026-10-03 11:59',
      '2026-10-06 15:41', '2026-10-06 23:56',
      '2026-10-07 06:56',
    ]);
    expect(summary).toMatchObject({
      days: 3.5,
      otHours: 3,
      ndHours: 2,
      regHolidays: 1,
      specialHolidaysWorked: 0.5,
      exceptions: 1,
      daysPresent: 4,
    });
  });

  it('pays no regular holiday when the employee has no credited day', () => {
    expect(period(WORKER, ['2026-10-01 07:00']).regHolidays).toBe(0);
  });

  it('gives fixed-pay staff every calendar day and no OT or regular holiday', () => {
    const summary = period({ ...WORKER, payType: 'fixed' }, ['2026-10-01 06:47', '2026-10-01 19:11']);
    expect(summary).toMatchObject({ days: 7, otHours: 0, regHolidays: 0 });
  });
});
