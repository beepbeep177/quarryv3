import { useEffect, useRef, useState } from 'react';
import { Check, Filter } from 'lucide-react';

interface CategoryMultiSelectProps {
  /** [name, count] pairs in display order. */
  options: [string, number][];
  /** Selected names. Empty means all categories. */
  selected: string[];
  totalCount: number;
  onChange: (selected: string[]) => void;
}

/** Dropdown with checkboxes for picking one or more categories. */
export default function CategoryMultiSelect({ options, selected, totalCount, onChange }: CategoryMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedSet = new Set(selected);
  const selectedCount = options.reduce((sum, [name, count]) => sum + (selectedSet.has(name) ? count : 0), 0);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function toggle(name: string) {
    const next = selectedSet.has(name) ? selected.filter(item => item !== name) : [...selected, name];
    // Keep the menu order so labels and exports read consistently.
    onChange(options.map(([option]) => option).filter(option => next.includes(option)));
  }

  const label = selected.length === 0
    ? `All categories (${totalCount})`
    : selected.length === 1
      ? `${selected[0]} (${selectedCount})`
      : `${selected[0]} + ${selected.length - 1} more (${selectedCount})`;

  return (
    <div ref={rootRef} className="relative sm:w-64">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Filter by category"
        title={selected.length > 1 ? selected.join(', ') : undefined}
        className={`relative w-full truncate rounded-lg border bg-white py-2.5 pl-9 pr-8 text-left text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200 ${
          selected.length === 0 ? 'border-slate-200 text-slate-600' : 'border-emerald-300 font-medium text-emerald-700'
        }`}
      >
        <Filter size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        {label}
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 w-full min-w-64 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-xs">
            <span className="text-slate-500">{selected.length === 0 ? 'Showing all' : `${selected.length} selected`}</span>
            <div className="flex gap-3 font-semibold">
              <button type="button" onClick={() => onChange(options.filter(([, count]) => count > 0).map(([name]) => name))} className="text-slate-500 hover:text-slate-800">
                Select all
              </button>
              <button type="button" onClick={() => onChange([])} disabled={selected.length === 0} className="text-emerald-700 hover:text-emerald-800 disabled:opacity-40">
                Clear
              </button>
            </div>
          </div>
          <ul role="listbox" aria-multiselectable="true" className="max-h-72 overflow-y-auto py-1">
            {options.map(([name, count]) => {
              const checked = selectedSet.has(name);
              return (
                <li key={name} role="option" aria-selected={checked}>
                  <button
                    type="button"
                    onClick={() => toggle(name)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-slate-50 ${count === 0 && !checked ? 'text-slate-400' : 'text-slate-700'}`}
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white'}`}>
                      {checked && <Check size={12} strokeWidth={3} />}
                    </span>
                    <span className="flex-1 truncate">{name}</span>
                    <span className="text-xs tabular-nums text-slate-400">{count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
