/**
 * Parser for the "Time Master Timekeeping System" attendance PDF.
 *
 * One employee per page:
 *   ID No. : 00000002   Dept. : NONE
 *   Name : DAVID, ALBERT
 *   2026-10-01  07:05  12:01  12:58  16:10
 *
 * The am IN / am OUT / pm IN / pm OUT / OT IN / OT OUT headers are not
 * reliable: the device fills punches left to right. Each day is therefore read
 * as an ordered list of punches and the timecard engine decides what they mean.
 */

export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
}

export interface BiometricDay {
  date: string;
  punches: string[];
}

export interface BiometricRecord {
  biometricId: string;
  name: string;
  dept: string;
  days: BiometricDay[];
}

export interface UnparsedPage {
  page: number;
  reason: string;
}

export interface BiometricParseResult {
  records: BiometricRecord[];
  pageCount: number;
  unparsedPages: UnparsedPage[];
  warnings: string[];
  dateFrom: string | null;
  dateTo: string | null;
  punchCount: number;
}

const LINE_TOLERANCE = 2;
const MAX_PUNCHES_PER_DAY = 6;
const DATE_PATTERN = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const HAS_DATE = /\b\d{4}-\d{2}-\d{2}\b/;
const TIME_PATTERN = /(?<![\d:])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/g;
const ID_LABEL = /ID\s*No\.?\s*:/i;
const DEPT_LABEL = /Dept\.?\s*:/i;
const NAME_LABEL = /Name\s*:/i;
/** Biometric IDs always contain a digit, so a neighbouring label ("Dept") is never read as an ID. */
const ID_VALUE = /ID\s*No\.?\s*:?\s*(\d[0-9A-Za-z-]*)/i;
const DEPT_VALUE = /Dept\.?\s*:\s*(.*?)(?=\s+(?:Name|ID\s*No)\.?\s*:|$)/i;
const NAME_VALUE = /Name\s*:\s*(.*?)(?=\s+(?:ID\s*No|Dept)\.?\s*:|$)/i;
/** A line holding only header values: "00000001 OFFICE". */
const ID_VALUE_LINE = /^(\d[0-9A-Za-z-]*)(?:\s+(.*))?$/;
const COLUMN_HEADER = /\bDATE\b|\bam\s+IN\b/i;
/** Words that may appear on a day row without making it suspicious. */
const ROW_WORDS = new Set([
  'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'am', 'pm', 'in', 'out', 'ot',
  'absent', 'off', 'rest', 'holiday', 'leave',
]);

/** Groups positioned pdf.js text items into lines: same y (±2), left to right. */
export function groupItemsIntoLines(items: PdfTextItem[], tolerance = LINE_TOLERANCE): string[] {
  const visible = items.filter(item => item.str.trim() !== '');
  const sorted = [...visible].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; items: PdfTextItem[] }[] = [];
  for (const item of sorted) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line.y - item.y) <= tolerance) {
      line.items.push(item);
      // Compare against the line's average so small jitter in either direction stays on one line.
      line.y += (item.y - line.y) / line.items.length;
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  }
  return lines.map(line => line.items
    .sort((a, b) => a.x - b.x)
    .map(item => item.str.trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim());
}

/** "00000002" -> "2". The biometric ID is the only reliable key between sources. */
export function normalizeBiometricId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.replace(/^0+/, '') || '0';
}

function isValidDate(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1) return false;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= lastDay;
}

function extractTimes(text: string): string[] {
  const times: string[] = [];
  for (const match of text.matchAll(TIME_PATTERN)) {
    times.push(`${match[1].padStart(2, '0')}:${match[2]}`);
  }
  return times;
}

function leftoverWords(text: string): string[] {
  return text
    .replace(DATE_PATTERN, ' ')
    .replace(TIME_PATTERN, ' ')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(word => word && !ROW_WORDS.has(word));
}

interface DayRow {
  date: string;
  punches: string[];
}

/** Reads every date (and the punches after it) on a single line. Returns null for non-row lines. */
function parseDayRows(line: string): DayRow[] | null {
  const matches = [...line.matchAll(DATE_PATTERN)];
  if (matches.length === 0) return null;
  if (leftoverWords(line).length > 0) return null;
  const rows: DayRow[] = [];
  matches.forEach((match, index) => {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!isValidDate(year, month, day)) return;
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index ?? line.length : line.length;
    rows.push({ date: match[0], punches: extractTimes(line.slice(start, end)) });
  });
  return rows;
}

function mergeDays(target: Map<string, Set<string>>, rows: DayRow[]) {
  for (const row of rows) {
    const punches = target.get(row.date) ?? new Set<string>();
    row.punches.forEach(punch => punches.add(punch));
    target.set(row.date, punches);
  }
}

/** Turns per-page text lines into one record per biometric ID. */
export function parseTimeMasterPages(pages: string[][]): BiometricParseResult {
  const byId = new Map<string, { name: string; dept: string; days: Map<string, Set<string>> }>();
  const order: string[] = [];
  const unparsedPages: UnparsedPage[] = [];
  const warnings: string[] = [];

  pages.forEach((lines, pageIndex) => {
    const pageNumber = pageIndex + 1;
    let biometricId = '';
    let name = '';
    let dept = '';
    const rows: DayRow[] = [];
    // The device prints header values slightly below their labels, so pdf.js
    // text can put "ID No. : Dept. :" on one line and "00000001 OFFICE" on the next.
    let pendingId = false;
    let pendingDept = false;
    let pendingName = false;

    for (const line of lines) {
      if (ID_LABEL.test(line) || DEPT_LABEL.test(line) || NAME_LABEL.test(line)) {
        if (ID_LABEL.test(line) && !biometricId) {
          const value = line.match(ID_VALUE);
          if (value) biometricId = normalizeBiometricId(value[1]);
          else pendingId = true;
        }
        if (DEPT_LABEL.test(line) && !dept) {
          const value = line.match(DEPT_VALUE)?.[1].trim() ?? '';
          if (value) dept = value;
          else pendingDept = true;
        }
        if (NAME_LABEL.test(line) && !name) {
          const value = line.match(NAME_VALUE)?.[1].trim() ?? '';
          if (value) name = value;
          else pendingName = true;
        }
        continue;
      }

      const isDataLine = HAS_DATE.test(line) || COLUMN_HEADER.test(line);
      if (pendingId && !isDataLine) {
        const value = line.match(ID_VALUE_LINE);
        if (value) {
          biometricId = normalizeBiometricId(value[1]);
          if (pendingDept && value[2]) dept = value[2].trim();
          pendingId = false;
          pendingDept = false;
          continue;
        }
      }
      if (pendingName && !isDataLine && !extractTimes(line).length) {
        name = line.trim();
        pendingName = false;
        continue;
      }
      if (isDataLine) {
        pendingId = false;
        pendingDept = false;
        pendingName = false;
      }

      // Day rows only count after the employee header, so print dates or
      // report ranges at the top of the page are never read as punches.
      if (!biometricId) continue;
      const dayRows = parseDayRows(line);
      if (dayRows === null) {
        if (HAS_DATE.test(line)) warnings.push(`Page ${pageNumber}: skipped line "${line}".`);
        continue;
      }
      for (const row of dayRows) {
        if (row.punches.length > MAX_PUNCHES_PER_DAY) {
          warnings.push(`Page ${pageNumber}: ${row.date} has ${row.punches.length} punches (expected at most ${MAX_PUNCHES_PER_DAY}).`);
        }
        rows.push(row);
      }
    }

    if (!biometricId) {
      unparsedPages.push({
        page: pageNumber,
        reason: lines.length === 0
          ? 'Blank page or scanned image (no text).'
          : lines.some(line => ID_LABEL.test(line)) ? 'Found "ID No." but could not read the number.' : 'No "ID No." header found.',
      });
      return;
    }

    let entry = byId.get(biometricId);
    if (!entry) {
      entry = { name, dept, days: new Map() };
      byId.set(biometricId, entry);
      order.push(biometricId);
    } else {
      if (entry.name && name && entry.name !== name) {
        warnings.push(`Page ${pageNumber}: ID ${biometricId} already appeared as "${entry.name}" but this page says "${name}". Their punches were combined; check the file.`);
      }
      if (!entry.name && name) entry.name = name;
      if (!entry.dept && dept) entry.dept = dept;
    }
    mergeDays(entry.days, rows);
  });

  let dateFrom: string | null = null;
  let dateTo: string | null = null;
  let punchCount = 0;
  const records = order.map(biometricId => {
    const entry = byId.get(biometricId)!;
    const days = [...entry.days.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, punches]) => {
        if (!dateFrom || date < dateFrom) dateFrom = date;
        if (!dateTo || date > dateTo) dateTo = date;
        const sorted = [...punches].sort();
        punchCount += sorted.length;
        return { date, punches: sorted };
      });
    return { biometricId, name: entry.name, dept: entry.dept, days };
  });

  return { records, pageCount: pages.length, unparsedPages, warnings, dateFrom, dateTo, punchCount };
}

/** Shape sent to wf_import_punches. */
export function toImportPayload(records: BiometricRecord[]) {
  return records.map(record => ({
    biometric_id: record.biometricId,
    name: record.name,
    dept: record.dept,
    days: record.days
      .filter(day => day.punches.length > 0)
      .map(day => ({ date: day.date, punches: [...day.punches] })),
  }));
}
