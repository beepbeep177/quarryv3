import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  Clock3,
  Cog,
  Download,
  Edit3,
  Fuel,
  Gauge,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Truck,
  Users,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { friendlyDbError, NOT_SAVED_MESSAGE } from '../lib/dbErrors';
import type { WobblerDailyEntry } from '../lib/database.types';
import { calculateWobblerMetrics, getWobblerStatus, type WobblerStatus } from '../lib/wobblerOperations';
import Pagination from './Pagination';
import ReadOnlyNotice from './ReadOnlyNotice';
import { paginate } from '../lib/pagination';
import ActionModal from './ActionModal';
import NoOperationButton from './NoOperationButton';
import TimeRangeInput from './TimeRangeInput';

const PAGE_SIZE = 8;

interface WobblerOperationsProps {
  canAdd?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canExport?: boolean;
}

interface EntryForm {
  entry_date: string;
  operation_hours: string;
  downtime_hours: string;
  time_schedule: string;
  breakdown: string;
  number_of_dumps: string;
  number_of_loaders: string;
  genset_diesel_consumption_liters: string;
  notes: string;
}

function toInputDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function todayInput() {
  return toInputDate(new Date());
}

function monthStart(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return toInputDate(new Date(date.getFullYear(), date.getMonth(), 1));
}

function monthEnd(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return toInputDate(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

function monthLabel(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', {
    month: 'long',
    year: 'numeric',
  });
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function fmt(value: number, digits = 2) {
  return Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function whole(value: number) {
  return Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 });
}

function parseWhole(value: string) {
  const parsed = Number.parseInt(value || '0', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseDecimal(value: string) {
  const parsed = Number.parseFloat(value || '0');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function csvEscape(value: string | number) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function initialForm(): EntryForm {
  return {
    entry_date: todayInput(),
    operation_hours: '',
    downtime_hours: '',
    time_schedule: '',
    breakdown: '',
    number_of_dumps: '',
    number_of_loaders: '',
    genset_diesel_consumption_liters: '',
    notes: '',
  };
}

function entryToForm(entry: WobblerDailyEntry): EntryForm {
  return {
    entry_date: entry.entry_date,
    operation_hours: String(entry.operation_hours || ''),
    downtime_hours: String(entry.downtime_hours || ''),
    time_schedule: entry.time_schedule || '',
    breakdown: entry.breakdown || '',
    number_of_dumps: String(entry.number_of_dumps || ''),
    number_of_loaders: String(entry.number_of_loaders || ''),
    genset_diesel_consumption_liters: String(entry.genset_diesel_consumption_liters || ''),
    notes: entry.notes || '',
  };
}

function statusForEntry(entry: WobblerDailyEntry) {
  return getWobblerStatus({
    operationMinutes: entry.operation_minutes,
    downtimeMinutes: entry.downtime_minutes,
    dumps: entry.number_of_dumps,
    loaders: entry.number_of_loaders,
    breakdown: entry.breakdown,
  });
}

function statusBadgeClass(status: WobblerStatus) {
  if (status === 'Completed') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'With Downtime') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'Needs Review') return 'border-red-200 bg-red-50 text-red-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

export default function WobblerOperations({
  canAdd = false,
  canEdit = false,
  canDelete = false,
  canExport = false,
}: WobblerOperationsProps) {
  const [entries, setEntries] = useState<WobblerDailyEntry[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(monthStart(todayInput()));
  const [form, setForm] = useState<EntryForm>(() => initialForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WobblerDailyEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const canManageEntries = canAdd || canEdit || canDelete;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');

    const { data, error: entriesError } = await supabase
      .from('wobbler_daily_entries')
      .select('*')
      .gte('entry_date', selectedMonth)
      .lte('entry_date', monthEnd(selectedMonth))
      .order('entry_date', { ascending: false });

    if (entriesError) {
      setError(entriesError.message);
    } else {
      setEntries((data ?? []) as WobblerDailyEntry[]);
    }

    setLoading(false);
  }, [selectedMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setPage(1);
  }, [search, selectedMonth]);

  function updateForm<K extends keyof EntryForm>(key: K, value: EntryForm[K]) {
    setForm(previous => ({ ...previous, [key]: value }));
  }

  const preview = useMemo(() => calculateWobblerMetrics({
    operationHours: parseDecimal(form.operation_hours),
    downtimeHours: parseDecimal(form.downtime_hours),
    dumps: parseWhole(form.number_of_dumps),
    loaders: parseWhole(form.number_of_loaders),
    dieselLiters: parseDecimal(form.genset_diesel_consumption_liters),
    breakdown: form.breakdown,
  }), [form]);

  const monthStats = useMemo(() => {
    const operationMinutes = entries.reduce((sum, entry) => sum + entry.operation_minutes, 0);
    const downtimeMinutes = entries.reduce((sum, entry) => sum + entry.downtime_minutes, 0);
    const dumps = entries.reduce((sum, entry) => sum + entry.number_of_dumps, 0);
    const dieselLiters = entries.reduce((sum, entry) => sum + entry.genset_diesel_consumption_liters, 0);
    const operatingDays = entries.filter(entry => entry.operation_minutes > 0).length;
    const loaderTotal = entries.reduce((sum, entry) => sum + entry.number_of_loaders, 0);
    const operationHours = round2(operationMinutes / 60);

    return {
      operationHours,
      downtimeHours: round2(downtimeMinutes / 60),
      dumps,
      dieselLiters: round2(dieselLiters),
      dumpsPerHour: operationHours > 0 ? round2(dumps / operationHours) : 0,
      dieselLitersPerHour: operationHours > 0 ? round2(dieselLiters / operationHours) : 0,
      averageLoaders: operatingDays > 0 ? round2(loaderTotal / operatingDays) : 0,
    };
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return entries;
    return entries.filter(entry => (
      entry.entry_date.includes(query)
      || entry.time_schedule.toLowerCase().includes(query)
      || entry.breakdown.toLowerCase().includes(query)
      || entry.notes.toLowerCase().includes(query)
    ));
  }, [entries, search]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedEntries = useMemo(
    () => paginate(filteredEntries, currentPage, PAGE_SIZE),
    [filteredEntries, currentPage],
  );

  // Blocks double-submit (double click / Enter pressed twice) while a save is in progress.
  const handleSubmitInFlight = useRef(false);
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (handleSubmitInFlight.current) return;
    handleSubmitInFlight.current = true;
    try {
      if (editingId && !canEdit) return;
      if (!editingId && !canAdd) return;

      setSaving(true);
      setError('');

      const payload = {
        entry_date: form.entry_date,
        operation_minutes: preview.operationMinutes,
        downtime_minutes: preview.downtimeMinutes,
        time_schedule: form.time_schedule.trim(),
        breakdown: form.breakdown.trim(),
        number_of_dumps: preview.dumps,
        number_of_loaders: preview.loaders,
        genset_diesel_consumption_liters: preview.dieselLiters,
        notes: form.notes.trim(),
      };

      const result = editingId
        ? await supabase.from('wobbler_daily_entries').update(payload).eq('id', editingId).select('id')
        : await supabase.from('wobbler_daily_entries').insert(payload).select('id');

      if (result.error) {
        setError(result.error.code === '23505'
          ? 'There is already a Wobbler entry for this date. Open that row to edit it.'
          : friendlyDbError(result.error));
      } else if (!result.data?.length) {
        setError(NOT_SAVED_MESSAGE);
      } else {
        handleReset();
        setSelectedMonth(monthStart(payload.entry_date));
        await fetchData();
      }

      setSaving(false);
    } finally {
      handleSubmitInFlight.current = false;
    }
  }

  function handleEdit(entry: WobblerDailyEntry) {
    setEditingId(entry.id);
    setForm(entryToForm(entry));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleReset() {
    setEditingId(null);
    setForm(initialForm());
  }

  function handleDelete(entry: WobblerDailyEntry) {
    if (canDelete) setDeleteTarget(entry);
  }

  async function handleConfirmDelete() {
    if (!canDelete || !deleteTarget) return;
    setDeleting(true);
    setError('');

    const { data: deletedRows, error: deleteError } = await supabase
      .from('wobbler_daily_entries')
      .delete()
      .eq('id', deleteTarget.id)
      .select('id');

    if (deleteError || !deletedRows?.length) {
      setError(friendlyDbError(deleteError));
      setDeleting(false);
      return;
    }

    setEntries(previous => previous.filter(entry => entry.id !== deleteTarget.id));
    setDeleteTarget(null);
    setDeleting(false);
  }

  function handleExport() {
    if (!canExport) return;
    const headers = [
      'Date',
      'Operation Minutes',
      'Operation Hours',
      'Downtime Minutes',
      'Downtime Hours',
      'Total Tracked Hours',
      'Time Schedule',
      'Breakdown',
      'Number of Dumps',
      'Number of Loaders',
      'Genset 5 Diesel Consumption (L)',
      'Dumps per Operation Hour',
      'Diesel Consumption (L/HR)',
      'Status',
      'Notes',
    ];
    const rows = filteredEntries.map(entry => [
      entry.entry_date,
      entry.operation_minutes,
      entry.operation_hours,
      entry.downtime_minutes,
      entry.downtime_hours,
      entry.total_tracked_hours,
      entry.time_schedule,
      entry.breakdown,
      entry.number_of_dumps,
      entry.number_of_loaders,
      entry.genset_diesel_consumption_liters,
      entry.dumps_per_operation_hour,
      entry.diesel_consumption_lph,
      statusForEntry(entry),
      entry.notes,
    ]);
    const csv = [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
    downloadTextFile(`wobbler-${selectedMonth}.csv`, csv, 'text/csv;charset=utf-8');
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mt-1 text-2xl font-bold text-slate-800">Wobbler Daily Input</h1>
          <p className="mt-0.5 text-sm text-slate-500">Daily operating, downtime, loader, dump, and Genset 5 records.</p>
        </div>
        <div className="flex items-center gap-2">
          {canExport && (
            <button
              onClick={handleExport}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            >
              <Download size={16} />
              Export
            </button>
          )}
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {!canManageEntries && (
        <ReadOnlyNotice message="Your account can view Wobbler records only. Ask a manager if you need to add or edit daily inputs." />
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={<Gauge size={21} />} label="Operation Hours" value={`${fmt(monthStats.operationHours)} hrs`} detail={`${monthLabel(selectedMonth)} total`} tone="emerald" />
        <MetricCard icon={<Clock3 size={21} />} label="Downtime Hours" value={`${fmt(monthStats.downtimeHours)} hrs`} detail="Recorded downtime" tone="amber" />
        <MetricCard icon={<Truck size={21} />} label="Number of Dumps" value={whole(monthStats.dumps)} detail={`${fmt(monthStats.dumpsPerHour)} dumps/hr`} tone="sky" />
        <MetricCard icon={<Users size={21} />} label="Average Loaders" value={fmt(monthStats.averageLoaders)} detail="Per operating day" tone="violet" />
        <MetricCard icon={<Fuel size={21} />} label="Diesel Rate" value={`${fmt(monthStats.dieselLitersPerHour)} L/hr`} detail={`${fmt(monthStats.dieselLiters)} L recorded`} tone="slate" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <form onSubmit={handleSubmit} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-lg font-bold text-slate-800">{editingId ? 'Edit Wobbler Daily Input' : 'New Wobbler Daily Input'}</h2>
            <p className="mt-0.5 text-xs text-slate-500">Encode the manual fields from the Wobbler data sheet.</p>
          </div>

          <div className="space-y-5 p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Date">
                <input type="date" value={form.entry_date} onChange={event => updateForm('entry_date', event.target.value)} className="input" required />
              </Field>
              <Field label="Time Schedule">
                <TimeRangeInput value={form.time_schedule} onChange={value => updateForm('time_schedule', value)} onUseHours={hours => updateForm('operation_hours', String(hours))} />
              </Field>
              <Field label="Operation Hours" helper={`${preview.operationMinutes} mins`}>
                <input type="number" min="0" step="0.01" value={form.operation_hours} onChange={event => updateForm('operation_hours', event.target.value)} className="input" placeholder="ex. 4" />
              </Field>
              <Field label="Downtime Hours" helper={`${preview.downtimeMinutes} mins`}>
                <input type="number" min="0" step="0.01" value={form.downtime_hours} onChange={event => updateForm('downtime_hours', event.target.value)} className="input" placeholder="ex. 1" />
              </Field>
              <Field label="Number of Dumps">
                <input type="number" min="0" step="1" value={form.number_of_dumps} onChange={event => updateForm('number_of_dumps', event.target.value)} className="input" placeholder="ex. 32" />
              </Field>
              <Field label="Number of Loaders">
                <input type="number" min="0" step="1" value={form.number_of_loaders} onChange={event => updateForm('number_of_loaders', event.target.value)} className="input" placeholder="ex. 2" />
              </Field>
              <Field label="Genset 5 Diesel Consumption (L)">
                <input type="number" min="0" step="0.01" value={form.genset_diesel_consumption_liters} onChange={event => updateForm('genset_diesel_consumption_liters', event.target.value)} className="input" placeholder="ex. 100" />
              </Field>
              <Field label="Breakdown">
                <input type="text" value={form.breakdown} onChange={event => updateForm('breakdown', event.target.value)} className="input" placeholder="ex. No Trouble" />
              </Field>
            </div>

            <Field label="Notes">
              <textarea value={form.notes} onChange={event => updateForm('notes', event.target.value)} className="input min-h-20 resize-y" placeholder="Optional encoder notes..." />
            </Field>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              {(editingId ? canEdit : canAdd) && (
                <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-200 transition-colors hover:bg-emerald-600 disabled:opacity-60">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {editingId ? 'Update Daily Input' : 'Save Daily Input'}
                </button>
              )}
              {!editingId && canAdd && (
                <NoOperationButton
                  module="wobbler"
                  date={form.entry_date}
                  onError={setError}
                  onDone={async () => {
                    const markedDate = form.entry_date;
                    setError('');
                    handleReset();
                    setSelectedMonth(monthStart(markedDate));
                    await fetchData();
                  }}
                />
              )}
              <button type="button" onClick={handleReset} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50">
                <RotateCcw size={16} />
                Reset
              </button>
            </div>
          </div>
        </form>

        <div className="space-y-5">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-800">Auto-Computed Preview</h2>
              <p className="mt-0.5 text-xs text-slate-500">Preview updates before saving.</p>
            </div>
            <div className="space-y-3 p-5">
              <ComputedRow label="Operation Hours" value={`${fmt(preview.operationHours)} hrs`} />
              <ComputedRow label="Downtime Hours" value={`${fmt(preview.downtimeHours)} hrs`} />
              <ComputedRow label="Tracked Hours" value={`${fmt(preview.trackedHours)} hrs`} />
              <ComputedRow label="Dumps per Hour" value={fmt(preview.dumpsPerHour)} />
              <ComputedRow label="Diesel Rate" value={`${fmt(preview.dieselLitersPerHour)} L/hr`} />
              <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <span className="text-sm text-slate-500">Status</span>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(preview.status)}`}>{preview.status}</span>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-800">Month Filter</h2>
              <p className="mt-0.5 text-xs text-slate-500">Recent entries and totals follow this month.</p>
            </div>
            <div className="p-5">
              <Field label="Month">
                <input
                  type="month"
                  value={selectedMonth.slice(0, 7)}
                  onChange={event => {
                    const nextMonth = `${event.target.value}-01`;
                    setSelectedMonth(nextMonth);
                    setForm(previous => ({ ...previous, entry_date: nextMonth }));
                  }}
                  className="input"
                />
              </Field>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Recent Wobbler Entries</h2>
            <p className="mt-0.5 text-xs text-slate-500">{monthLabel(selectedMonth)} operations log</p>
          </div>
          <div className="relative min-w-64">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search date, schedule, breakdown..." className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
            <Loader2 size={16} className="animate-spin" />
            Loading Wobbler entries...
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="py-16 text-center">
            <Cog size={34} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-semibold text-slate-600">No Wobbler entries found</p>
            <p className="mt-1 text-xs text-slate-400">Daily input records for this month will appear here.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-right">Op Hrs</th>
                    <th className="px-4 py-3 text-right">Down Hrs</th>
                    <th className="px-4 py-3 text-right">Dumps</th>
                    <th className="px-4 py-3 text-right">Loaders</th>
                    <th className="px-4 py-3 text-right">Diesel</th>
                    <th className="px-4 py-3 text-right">Productivity</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    {(canEdit || canDelete) && <th className="px-4 py-3"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedEntries.map(entry => {
                    const status = statusForEntry(entry);
                    return (
                      <tr key={entry.id} className="transition-colors hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-700">{formatDate(entry.entry_date)}</p>
                          <p className="max-w-44 truncate text-xs text-slate-400">{entry.time_schedule || 'No schedule'}</p>
                          {entry.breakdown && <p className="max-w-44 truncate text-xs text-slate-400" title={entry.breakdown}>{entry.breakdown}</p>}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-emerald-600">{fmt(entry.operation_hours)}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-amber-600">{fmt(entry.downtime_hours)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">{whole(entry.number_of_dumps)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">{whole(entry.number_of_loaders)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-violet-600">
                          <p>{fmt(entry.genset_diesel_consumption_liters)} L</p>
                          <p className="text-xs text-slate-400">{fmt(entry.diesel_consumption_lph)} L/hr</p>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">{fmt(entry.dumps_per_operation_hour)} dumps/hr</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(status)}`}>{status}</span>
                        </td>
                        {(canEdit || canDelete) && (
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1.5">
                              {canEdit && (
                                <button onClick={() => handleEdit(entry)} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600" title="Edit entry">
                                  <Edit3 size={15} />
                                </button>
                              )}
                              {canDelete && (
                                <button onClick={() => handleDelete(entry)} disabled={deleting} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-60" title="Delete entry">
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={currentPage} pageSize={PAGE_SIZE} totalItems={filteredEntries.length} onPageChange={setPage} />
          </>
        )}
      </div>

      <ActionModal
        open={!!deleteTarget}
        title="Delete Wobbler Entry"
        description="This entry will be permanently removed from the daily input records."
        variant="danger"
        confirmLabel="Delete Entry"
        loading={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Delete the Wobbler entry for <span className="font-semibold text-slate-900">{deleteTarget ? formatDate(deleteTarget.entry_date) : ''}</span>?
          </p>
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Dumps</p>
              <p className="mt-1 font-bold tabular-nums text-slate-800">{deleteTarget ? whole(deleteTarget.number_of_dumps) : '0'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Operation Hours</p>
              <p className="mt-1 font-bold tabular-nums text-slate-800">{deleteTarget ? fmt(deleteTarget.operation_hours) : '0.00'} hrs</p>
            </div>
          </div>
        </div>
      </ActionModal>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: 'emerald' | 'sky' | 'amber' | 'violet' | 'slate';
}) {
  const toneClass = {
    emerald: 'bg-emerald-50 text-emerald-600',
    sky: 'bg-sky-50 text-sky-600',
    amber: 'bg-amber-50 text-amber-600',
    violet: 'bg-violet-50 text-violet-600',
    slate: 'bg-slate-100 text-slate-600',
  }[tone];

  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-4">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${toneClass}`}>{icon}</div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-1 text-xl font-bold tabular-nums text-slate-800">{value}</p>
        <p className="mt-1 truncate text-xs text-slate-400">{detail}</p>
      </div>
    </div>
  );
}

function Field({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        {helper && <span className="text-xs font-medium text-emerald-600">{helper}</span>}
      </span>
      {children}
    </label>
  );
}

function ComputedRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-bold tabular-nums text-slate-800">{value}</span>
    </div>
  );
}
