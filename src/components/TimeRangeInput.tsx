import { useEffect, useState } from 'react';
import {
  clockToMinutes,
  formatTimeRange,
  minutesToClock,
  parseTimeRange,
  rangeDurationMinutes,
} from '../lib/timeRange';

const PRESETS = [
  { start: 7 * 60, end: 16 * 60 },
  { start: 8 * 60, end: 17 * 60 },
  { start: 8 * 60, end: 19 * 60 },
  { start: 11 * 60, end: 16 * 60 },
];

interface TimeRangeInputProps {
  /** Stored text, e.g. "8am-5pm". */
  value: string;
  onChange: (value: string) => void;
  /** When given, shows a shortcut to copy the schedule length into Operation Hours. */
  onUseHours?: (hours: number) => void;
}

function formatHours(minutes: number) {
  const hours = Math.round((minutes / 60) * 100) / 100;
  return `${hours} ${hours === 1 ? 'hr' : 'hrs'}`;
}

/** Start/end pickers with quick presets; saves the same "8am-5pm" text as before. */
export default function TimeRangeInput({ value, onChange, onUseHours }: TimeRangeInputProps) {
  const parsed = parseTimeRange(value);
  const [start, setStart] = useState(parsed ? minutesToClock(parsed.start) : '');
  const [end, setEnd] = useState(parsed ? minutesToClock(parsed.end) : '');

  // Keep the pickers in sync when the form is reset or an entry is opened for editing.
  useEffect(() => {
    const next = parseTimeRange(value);
    if (next) {
      setStart(minutesToClock(next.start));
      setEnd(minutesToClock(next.end));
    } else if (!value) {
      setStart('');
      setEnd('');
    }
  }, [value]);

  function update(nextStart: string, nextEnd: string) {
    setStart(nextStart);
    setEnd(nextEnd);
    const startMinutes = clockToMinutes(nextStart);
    const endMinutes = clockToMinutes(nextEnd);
    if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) {
      if (!nextStart && !nextEnd) onChange('');
      return;
    }
    onChange(formatTimeRange({ start: startMinutes, end: endMinutes }));
  }

  const legacyText = value && !parsed ? value : '';
  const duration = parsed ? rangeDurationMinutes(parsed) : 0;
  const overnight = parsed ? parsed.end < parsed.start : false;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input type="time" aria-label="Start time" value={start} onChange={event => update(event.target.value, end)} className="input min-w-0 flex-1" />
        <span className="text-xs font-medium text-slate-400">to</span>
        <input type="time" aria-label="End time" value={end} onChange={event => update(start, event.target.value)} className="input min-w-0 flex-1" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map(preset => {
          const label = formatTimeRange(preset);
          const active = parsed?.start === preset.start && parsed?.end === preset.end;
          return (
            <button
              key={label}
              type="button"
              onClick={() => update(minutesToClock(preset.start), minutesToClock(preset.end))}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${active ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
            >
              {label}
            </button>
          );
        })}
        {value && (
          <button type="button" onClick={() => update('', '')} className="px-1 text-[11px] font-medium text-slate-400 hover:text-slate-600">
            Clear
          </button>
        )}
      </div>
      {parsed && (
        <p className="text-[11px] text-slate-500">
          {formatTimeRange(parsed)} · {formatHours(duration)}{overnight ? ' (overnight)' : ''}
          {onUseHours && (
            <>
              {' · '}
              <button type="button" onClick={() => onUseHours(Math.round((duration / 60) * 100) / 100)} className="font-semibold text-emerald-700 hover:text-emerald-800">
                Use as Operation Hours
              </button>
            </>
          )}
        </p>
      )}
      {legacyText && (
        <p className="text-[11px] text-amber-600">Saved as “{legacyText}”. Pick a start and end time to replace it.</p>
      )}
    </div>
  );
}
