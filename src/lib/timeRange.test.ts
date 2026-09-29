import { describe, expect, it } from 'vitest';
import { formatTimeRange, parseTimeRange, rangeDurationMinutes } from './timeRange';

describe('parseTimeRange', () => {
  it('reads the formats encoders already type', () => {
    expect(parseTimeRange('8am-5pm')).toEqual({ start: 480, end: 1020 });
    expect(parseTimeRange('8:30 AM - 5 PM')).toEqual({ start: 510, end: 1020 });
    expect(parseTimeRange('11am to 4pm')).toEqual({ start: 660, end: 960 });
    expect(parseTimeRange('08:00-17:00')).toEqual({ start: 480, end: 1020 });
    expect(parseTimeRange('8-5pm')).toEqual({ start: 480, end: 1020 });
    expect(parseTimeRange('1-5pm')).toEqual({ start: 780, end: 1020 });
    expect(parseTimeRange('12pm-12am')).toEqual({ start: 720, end: 0 });
  });

  it('rejects text that is not a time range', () => {
    expect(parseTimeRange('')).toBeNull();
    expect(parseTimeRange('whole day')).toBeNull();
    expect(parseTimeRange('13pm-5pm')).toBeNull();
    expect(parseTimeRange('8am-8am')).toBeNull();
  });
});

describe('format and duration', () => {
  it('formats back to the stored style', () => {
    expect(formatTimeRange({ start: 480, end: 1020 })).toBe('8am-5pm');
    expect(formatTimeRange({ start: 510, end: 0 })).toBe('8:30am-12am');
  });

  it('handles overnight shifts', () => {
    expect(rangeDurationMinutes({ start: 480, end: 1020 })).toBe(540);
    expect(rangeDurationMinutes({ start: 1320, end: 360 })).toBe(480);
  });
});
