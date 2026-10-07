import { useCallback, useMemo, useState } from 'react';
import { addDaysToDateKey, dateKeyToDisplayDate, dayOfWeekForDateKey, todayBusinessDate } from './date';

export type DatePreset = 'ALL' | 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'LAST_MONTH' | 'CUSTOM';
export type QuickDatePreset = Exclude<DatePreset, 'CUSTOM'>;

export const DATE_PRESETS: { id: QuickDatePreset; label: string }[] = [
  { id: 'ALL', label: 'All dates' },
  { id: 'TODAY', label: 'Today' },
  { id: 'THIS_WEEK', label: 'This week' },
  { id: 'THIS_MONTH', label: 'This month' },
  { id: 'LAST_MONTH', label: 'Last month' },
];

/** Date range (YYYY-MM-DD, Philippine time) for a quick preset; empty strings mean "no limit". */
export function presetRange(preset: QuickDatePreset, today = todayBusinessDate()): { from: string; to: string } {
  if (preset === 'TODAY') return { from: today, to: today };
  if (preset === 'THIS_WEEK') {
    const day = dayOfWeekForDateKey(today);
    const monday = addDaysToDateKey(today, day === 0 ? -6 : 1 - day);
    return { from: monday, to: addDaysToDateKey(monday, 6) };
  }
  const monthStart = `${today.slice(0, 8)}01`;
  if (preset === 'THIS_MONTH') return { from: monthStart, to: addDaysToDateKey(`${addDaysToDateKey(monthStart, 32).slice(0, 8)}01`, -1) };
  if (preset === 'LAST_MONTH') {
    const lastMonthEnd = addDaysToDateKey(monthStart, -1);
    return { from: `${lastMonthEnd.slice(0, 8)}01`, to: lastMonthEnd };
  }
  return { from: '', to: '' };
}

export function shortDate(value: string) {
  return dateKeyToDisplayDate(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Normalized range (swaps a reversed From/To) and a readable label. */
export function describeRange(from: string, to: string) {
  const start = from && to && to < from ? to : from;
  const end = from && to && to < from ? from : to;
  const active = Boolean(start || end);
  const label = !active
    ? ''
    : start && end
      ? (start === end ? shortDate(start) : `${shortDate(start)} – ${shortDate(end)}`)
      : start ? `from ${shortDate(start)}` : `until ${shortDate(end)}`;
  return { start, end, active, label };
}

export function isWithinRange(dateKey: string, start: string, end: string) {
  return (!start || dateKey >= start) && (!end || dateKey <= end);
}

/** State for a quick-preset + custom From/To date filter. */
export function useDateRange() {
  const [preset, setPreset] = useState<DatePreset>('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const applyPreset = useCallback((next: QuickDatePreset) => {
    const range = presetRange(next);
    setPreset(next);
    setFrom(range.from);
    setTo(range.to);
  }, []);

  const setCustom = useCallback((which: 'from' | 'to', value: string) => {
    setPreset('CUSTOM');
    if (which === 'from') setFrom(value);
    else setTo(value);
  }, []);

  const range = useMemo(() => describeRange(from, to), [from, to]);
  return { preset, from, to, applyPreset, setCustom, ...range };
}

export type DateRangeState = ReturnType<typeof useDateRange>;
