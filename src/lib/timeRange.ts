/** Helpers for operation time schedules stored as text like "8am-5pm" or "8:30am-5pm". */

export interface TimeRange {
  /** Minutes after midnight, 0-1439. */
  start: number;
  end: number;
}

/** "HH:MM" (input type=time) -> minutes after midnight. */
export function clockToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Minutes after midnight -> "HH:MM" for input type=time. */
export function minutesToClock(total: number): string {
  const normalized = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

/** Minutes after midnight -> "8am", "8:30am", "12pm". */
export function formatTimeLabel(total: number): string {
  const normalized = ((total % 1440) + 1440) % 1440;
  const hours24 = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const suffix = hours24 < 12 ? 'am' : 'pm';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return minutes === 0 ? `${hours12}${suffix}` : `${hours12}:${String(minutes).padStart(2, '0')}${suffix}`;
}

export function formatTimeRange(range: TimeRange): string {
  return `${formatTimeLabel(range.start)}-${formatTimeLabel(range.end)}`;
}

/** Length of the range in minutes; an end before the start is treated as an overnight shift. */
export function rangeDurationMinutes(range: TimeRange): number {
  const diff = range.end - range.start;
  return diff > 0 ? diff : diff + 1440;
}

const PART = String.raw`(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|a|p)?`;
const RANGE_PATTERN = new RegExp(String.raw`^\s*${PART}\s*(?:-|–|—|to)\s*${PART}\s*$`, 'i');

function toMinutes(hourText: string, minuteText: string | undefined, meridiem: string | undefined): number | null {
  let hours = Number(hourText);
  const minutes = minuteText ? Number(minuteText) : 0;
  if (minutes > 59) return null;
  const mark = meridiem?.toLowerCase().replace(/\./g, '').charAt(0);
  if (mark) {
    if (hours < 1 || hours > 12) return null;
    if (mark === 'a' && hours === 12) hours = 0;
    if (mark === 'p' && hours !== 12) hours += 12;
  } else if (hours > 23) {
    return null;
  }
  return hours * 60 + minutes;
}

/** Parses free text like "8am-5pm", "8:30 AM - 5 PM", "11am to 4pm", "08:00-17:00". */
export function parseTimeRange(text: string): TimeRange | null {
  const match = RANGE_PATTERN.exec(text);
  if (!match) return null;
  let startMark = match[3];
  const endMark = match[6];
  // "8-5pm": borrow the end's am/pm only when that keeps the start before the end.
  if (!startMark && endMark && Number(match[1]) <= 12) {
    const borrowed = toMinutes(match[1], match[2], endMark);
    const end = toMinutes(match[4], match[5], endMark);
    startMark = borrowed !== null && end !== null && borrowed < end ? endMark : endMark.toLowerCase().startsWith('p') ? 'am' : 'pm';
  }
  const start = toMinutes(match[1], match[2], startMark);
  const end = toMinutes(match[4], match[5], endMark);
  if (start === null || end === null || start === end) return null;
  return { start, end };
}
