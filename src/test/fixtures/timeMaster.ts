import type { PdfTextItem } from '../../lib/workforce/biometricParser';

/**
 * Synthetic "Time Master Timekeeping System" pages (no real employees).
 * Punches follow the timecard engine's documented cases.
 */
export const TIME_MASTER_PAGES: string[][] = [
  [
    'Time Master Timekeeping System',
    'Printed : 2026-10-08 10:30',
    'ID No. : 00000007 Dept. : NONE',
    'Name : TESTER, ALPHA',
    'Date am IN am OUT pm IN pm OUT OT IN OT OUT',
    '2026-10-01 06:47 19:11',
    '2026-10-02 07:37 16:56',
    '2026-10-03 07:01 11:59',
    '2026-10-04',
    '2026-10-05 07:59 17:33',
    '2026-10-06 15:41 23:56',
    '2026-10-07 07:37 23:54',
  ],
  [
    'Time Master Timekeeping System',
    'ID No. : 00000008 Dept. : QUARRY',
    'Name : SAMPLE, BETA',
    'Date am IN am OUT pm IN pm OUT OT IN OT OUT',
    '2026-10-01 07:05 07:06 17:24',
    '2026-10-02 06:56',
    '2026-10-03 7:02 12:00 12:58 16:01',
  ],
  // Continuation page for the first employee: merged by biometric ID.
  [
    'ID No. : 7 Dept. : NONE',
    'Name : TESTER, ALPHA',
    '2026-10-08 07:00 16:00',
  ],
  [],
  ['Summary report', 'Total employees : 2'],
];

/**
 * Real device layout: header values are printed ~2.6 units below their labels,
 * so labels and values group into separate lines. Synthetic names.
 */
export const TIME_MASTER_SPLIT_HEADER_ITEMS: PdfTextItem[] = [
  { str: 'Timekeeping System', x: 451, y: 788.2 },
  { str: 'EMPLOYEE ATTENDANCE LOGS', x: 161, y: 749.4 },
  { str: 'Name :', x: 70, y: 685.7 },
  { str: 'Dept. :', x: 255, y: 714.8 },
  { str: 'ID No. :', x: 68, y: 715.7 },
  { str: '00000004', x: 124, y: 713.1 },
  { str: 'EXAMPLE, DELTA', x: 124, y: 683.5 },
  { str: 'NONE', x: 311, y: 713.1 },
  { str: 'am IN', x: 139, y: 650 },
  { str: 'DATE', x: 68, y: 650 },
  { str: 'am OUT', x: 198, y: 650 },
  { str: '07:09', x: 140, y: 623.4 },
  { str: '17:02', x: 205, y: 624.2 },
  { str: '2026-04-10', x: 58, y: 623.7 },
  { str: '2026-04-11', x: 58, y: 606.9 },
  { str: '06:28', x: 140, y: 573.2 },
  { str: '16:59', x: 205, y: 573.9 },
  { str: '2026-04-13', x: 58, y: 573.4 },
  { str: '21:07', x: 270, y: 573.4 },
];

/** Same layout for an employee with no name printed. */
export const TIME_MASTER_SPLIT_NO_NAME_ITEMS: PdfTextItem[] = TIME_MASTER_SPLIT_HEADER_ITEMS
  .filter(item => item.str !== 'EXAMPLE, DELTA')
  .map(item => (item.str === '00000004' ? { ...item, str: '00000005' } : item));

/** The second page as positioned pdf.js items, with small y jitter between items on one line. */
export const TIME_MASTER_ITEMS: PdfTextItem[] = [
  { str: 'ID No. :', x: 40, y: 760 },
  { str: '00000008', x: 90, y: 760.5 },
  { str: 'Dept. :', x: 240, y: 759 },
  { str: 'QUARRY', x: 280, y: 760 },
  { str: 'Name :', x: 40, y: 742 },
  { str: 'SAMPLE, BETA', x: 90, y: 741 },
  { str: 'am IN', x: 120, y: 720 },
  { str: 'Date', x: 40, y: 720 },
  { str: 'am OUT', x: 170, y: 720 },
  { str: '17:24', x: 220, y: 700.8 },
  { str: '2026-10-01', x: 40, y: 700 },
  { str: '07:05', x: 120, y: 701.5 },
  { str: '07:06', x: 170, y: 699 },
  { str: ' ', x: 300, y: 700 },
  { str: '2026-10-02', x: 40, y: 684 },
  { str: '06:56', x: 120, y: 684 },
];
