import { useEffect, useState } from 'react';

/** All business dates (ledger dates, "today", reports) follow Philippine time. */
export const BUSINESS_TIME_ZONE = 'Asia/Manila';

const dateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Returns YYYY-MM-DD for the given instant in Philippine time. */
export function toBusinessDateKey(date: Date = new Date()): string {
  const parts = dateKeyFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Today's business date (YYYY-MM-DD, Philippine time). Never use toISOString() for this: it is UTC. */
export function todayBusinessDate(): string {
  return toBusinessDateKey(new Date());
}

/** Adds whole days to a YYYY-MM-DD key without timezone drift. */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Day of week for a YYYY-MM-DD key (0 = Sunday). */
export function dayOfWeekForDateKey(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Local Date at midnight for a YYYY-MM-DD key, for display formatting only. */
export function dateKeyToDisplayDate(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00`);
}

/**
 * Today's business date that updates itself after midnight and when the tab
 * regains focus, so screens left open overnight do not keep showing yesterday.
 */
export function useBusinessToday(): string {
  const [today, setToday] = useState(todayBusinessDate);

  useEffect(() => {
    const refresh = () => setToday(current => {
      const next = todayBusinessDate();
      return next === current ? current : next;
    });
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  return today;
}
