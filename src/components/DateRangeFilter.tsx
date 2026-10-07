import { DATE_PRESETS, type DateRangeState } from '../lib/dateRange';

/** Quick date presets plus custom From/To inputs. */
export default function DateRangeFilter({ range }: { range: DateRangeState }) {
  const inputClass = 'rounded-lg border bg-white px-3 py-1.5 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-white p-1">
        {DATE_PRESETS.map(preset => (
          <button
            key={preset.id}
            type="button"
            onClick={() => range.applyPreset(preset.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              range.preset === preset.id ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={range.from}
          onChange={e => range.setCustom('from', e.target.value)}
          aria-label="From date"
          className={`${inputClass} ${range.preset === 'CUSTOM' && range.from ? 'border-emerald-300' : 'border-slate-200'}`}
        />
        <span className="text-xs text-slate-400">to</span>
        <input
          type="date"
          value={range.to}
          onChange={e => range.setCustom('to', e.target.value)}
          aria-label="To date"
          className={`${inputClass} ${range.preset === 'CUSTOM' && range.to ? 'border-emerald-300' : 'border-slate-200'}`}
        />
      </div>
    </div>
  );
}
