import { describe, expect, it } from 'vitest';
import { TIME_MASTER_ITEMS, TIME_MASTER_PAGES, TIME_MASTER_SPLIT_HEADER_ITEMS, TIME_MASTER_SPLIT_NO_NAME_ITEMS } from '../../test/fixtures/timeMaster';
import { groupItemsIntoLines, normalizeBiometricId, parseTimeMasterPages, toImportPayload } from './biometricParser';

describe('pdf text grouping', () => {
  it('groups items within ±2 of the same y into one line, left to right', () => {
    expect(groupItemsIntoLines(TIME_MASTER_ITEMS)).toEqual([
      'ID No. : 00000008 Dept. : QUARRY',
      'Name : SAMPLE, BETA',
      'Date am IN am OUT',
      '2026-10-01 07:05 07:06 17:24',
      '2026-10-02 06:56',
    ]);
  });

  it('keeps lines more than 2 units apart separate', () => {
    expect(groupItemsIntoLines([
      { str: 'A', x: 0, y: 100 },
      { str: 'B', x: 0, y: 97.5 },
    ])).toEqual(['A', 'B']);
  });
});

describe('Time Master parser', () => {
  const result = parseTimeMasterPages(TIME_MASTER_PAGES);

  it('reads one record per biometric ID and merges continuation pages', () => {
    expect(result.records.map(record => record.biometricId)).toEqual(['7', '8']);
    expect(result.records[0]).toMatchObject({ name: 'TESTER, ALPHA', dept: 'NONE' });
    expect(result.records[1]).toMatchObject({ name: 'SAMPLE, BETA', dept: 'QUARRY' });
    expect(result.records[0].days.map(day => day.date)).toContain('2026-10-08');
  });

  it('treats each day as an ordered punch list and ignores the column headers', () => {
    const beta = result.records[1];
    expect(beta.days).toEqual([
      { date: '2026-10-01', punches: ['07:05', '07:06', '17:24'] },
      { date: '2026-10-02', punches: ['06:56'] },
      { date: '2026-10-03', punches: ['07:02', '12:00', '12:58', '16:01'] },
    ]);
  });

  it('keeps days with no punches and pads single-digit hours', () => {
    const alpha = result.records[0];
    expect(alpha.days.find(day => day.date === '2026-10-04')).toEqual({ date: '2026-10-04', punches: [] });
    expect(alpha.days.find(day => day.date === '2026-10-01')?.punches).toEqual(['06:47', '19:11']);
  });

  it('never reads the print date above the header as a punch', () => {
    expect(result.records[0].days.find(day => day.date === '2026-10-08')?.punches).toEqual(['07:00', '16:00']);
    expect(result.dateFrom).toBe('2026-10-01');
    expect(result.dateTo).toBe('2026-10-08');
  });

  it('reports pages it could not read', () => {
    expect(result.pageCount).toBe(5);
    expect(result.unparsedPages).toEqual([
      { page: 4, reason: 'Blank page or scanned image (no text).' },
      { page: 5, reason: 'No "ID No." header found.' },
    ]);
  });

  it('counts punches across all records', () => {
    expect(result.punchCount).toBe(2 + 2 + 2 + 2 + 2 + 2 + 2 + 3 + 1 + 4);
  });

  it('warns about unexpected rows instead of guessing', () => {
    const odd = parseTimeMasterPages([[
      'ID No. : 00000009 Dept. : NONE',
      'Name : EXAMPLE, GAMMA',
      'Total hours 2026-10-01 40:00',
      '2026-10-02 06:00 07:00 08:00 09:00 10:00 11:00 12:00',
    ]]);
    expect(odd.records[0].days).toHaveLength(1);
    expect(odd.warnings).toHaveLength(2);
  });

  it('reads header values printed on the line below their labels (real device layout)', () => {
    const split = parseTimeMasterPages([
      groupItemsIntoLines(TIME_MASTER_SPLIT_HEADER_ITEMS),
      groupItemsIntoLines(TIME_MASTER_SPLIT_NO_NAME_ITEMS),
    ]);
    expect(split.unparsedPages).toEqual([]);
    expect(split.records.map(({ biometricId, name, dept }) => ({ biometricId, name, dept }))).toEqual([
      { biometricId: '4', name: 'EXAMPLE, DELTA', dept: 'NONE' },
      { biometricId: '5', name: '', dept: 'NONE' },
    ]);
    expect(split.records[0].days).toEqual([
      { date: '2026-04-10', punches: ['07:09', '17:02'] },
      { date: '2026-04-11', punches: [] },
      { date: '2026-04-13', punches: ['06:28', '16:59', '21:07'] },
    ]);
  });

  it('never reads a neighbouring label as the biometric ID', () => {
    const result = parseTimeMasterPages([['ID No. : Dept. :', 'Name :', 'DATE am IN am OUT', '2026-04-10 07:00 16:00']]);
    expect(result.records).toEqual([]);
    expect(result.unparsedPages).toEqual([{ page: 1, reason: 'Found "ID No." but could not read the number.' }]);
  });

  it('warns when one ID appears on pages with different names', () => {
    const result = parseTimeMasterPages([
      ['ID No. : 00000009 Dept. : NONE', 'Name : EXAMPLE, GAMMA'],
      ['ID No. : 9 Dept. : NONE', 'Name : EXAMPLE, OMEGA'],
    ]);
    expect(result.records).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
  });

  it('builds the import payload without empty days', () => {
    const payload = toImportPayload(result.records);
    expect(payload[0].days.some(day => day.date === '2026-10-04')).toBe(false);
    expect(payload[1]).toMatchObject({ biometric_id: '8', name: 'SAMPLE, BETA', dept: 'QUARRY' });
  });
});

describe('biometric ID normalization', () => {
  it.each([
    ['00000002', '2'],
    [' 0012 ', '12'],
    ['0000', '0'],
    ['', ''],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeBiometricId(input)).toBe(expected);
  });
});
