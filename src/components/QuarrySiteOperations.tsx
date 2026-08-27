import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  CalendarDays,
  Download,
  Edit3,
  Fuel,
  Loader2,
  Mountain,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Truck,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { QuarrySiteDailyEntry } from '../lib/database.types';
import Pagination from './Pagination';
import ReadOnlyNotice from './ReadOnlyNotice';
import { paginate } from '../lib/pagination';
import ActionModal from './ActionModal';

const PAGE_SIZE = 8;
const BINDER_RATE = 450;
const BOULDER_RATE = 1500;

interface QuarrySiteOperationsProps {
  canAdd?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canExport?: boolean;
}

interface EntryForm {
  entry_date: string;
  jafcor_binder_trips: string;
  jafcor_boulder_trips: string;
  zaffara_boulder_trips: string;
  number_of_trucks: string;
  quarry_equipment_diesel_liters: string;
  total_diesel_consumption_liters: string;
  number_of_equipment: string;
  notes: string;
}

function todayInput() {
  const now = new Date();
  return toInputDate(now);
}

function toInputDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
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
  return Number(value || 0).toLocaleString('en-PH', {
    maximumFractionDigits: 0,
  });
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

function parseTruckTotal(value: string) {
  const parts = value
    .split('/')
    .map(part => Number.parseFloat(part.trim()))
    .filter(part => Number.isFinite(part) && part > 0);

  if (parts.length > 0) return round2(parts.reduce((sum, part) => sum + part, 0));
  return parseDecimal(value);
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
    jafcor_binder_trips: '',
    jafcor_boulder_trips: '',
    zaffara_boulder_trips: '',
    number_of_trucks: '',
    quarry_equipment_diesel_liters: '',
    total_diesel_consumption_liters: '',
    number_of_equipment: '',
    notes: '',
  };
}

function entryToForm(entry: QuarrySiteDailyEntry): EntryForm {
  return {
    entry_date: entry.entry_date,
    jafcor_binder_trips: String(entry.jafcor_binder_trips || ''),
    jafcor_boulder_trips: String(entry.jafcor_boulder_trips || ''),
    zaffara_boulder_trips: String(entry.zaffara_boulder_trips || ''),
    number_of_trucks: entry.number_of_trucks || '',
    quarry_equipment_diesel_liters: String(entry.quarry_equipment_diesel_liters || ''),
    total_diesel_consumption_liters: String(entry.total_diesel_consumption_liters || ''),
    number_of_equipment: String(entry.number_of_equipment || ''),
    notes: entry.notes || '',
  };
}

function statusForEntry(entry: QuarrySiteDailyEntry) {
  const hasTrips = entry.jafcor_binder_trips > 0 || entry.total_boulder_trips > 0;
  const hasDiesel = entry.total_diesel_consumption_liters > 0 || entry.quarry_equipment_diesel_liters > 0;
  if (!hasTrips && !hasDiesel && !entry.number_of_trucks && entry.number_of_equipment === 0) return 'No Work';
  if (!hasTrips && hasDiesel) return 'Diesel Only';
  return 'Completed';
}

function statusBadgeClass(status: string) {
  if (status === 'Completed') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'Diesel Only') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
}

export default function QuarrySiteOperations({
  canAdd = false,
  canEdit = false,
  canDelete = false,
  canExport = false,
}: QuarrySiteOperationsProps) {
  const [entries, setEntries] = useState<QuarrySiteDailyEntry[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(monthStart(todayInput()));
  const [form, setForm] = useState<EntryForm>(() => initialForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<QuarrySiteDailyEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const canManageEntries = canAdd || canEdit || canDelete;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');

    const { data, error: entriesError } = await supabase
      .from('quarry_site_daily_entries')
      .select('*')
      .gte('entry_date', selectedMonth)
      .lte('entry_date', monthEnd(selectedMonth))
      .order('entry_date', { ascending: false });

    if (entriesError) {
      setError(entriesError.message);
    } else {
      setEntries((data ?? []) as QuarrySiteDailyEntry[]);
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
    setForm(prev => ({ ...prev, [key]: value }));
  }

  const preview = useMemo(() => {
    const binderTrips = parseWhole(form.jafcor_binder_trips);
    const jafcorBoulderTrips = parseWhole(form.jafcor_boulder_trips);
    const zaffaraBoulderTrips = parseWhole(form.zaffara_boulder_trips);
    const totalBoulderTrips = jafcorBoulderTrips + zaffaraBoulderTrips;
    const quarryDiesel = parseDecimal(form.quarry_equipment_diesel_liters);
    const totalDiesel = parseDecimal(form.total_diesel_consumption_liters);
    const equipment = parseWhole(form.number_of_equipment);
    const truckTotal = parseTruckTotal(form.number_of_trucks);
    const binderAmount = round2(BINDER_RATE * binderTrips);
    const jafcorBoulderAmount = round2(BOULDER_RATE * jafcorBoulderTrips);
    const totalAmount = round2(binderAmount + jafcorBoulderAmount);

    return {
      binderTrips,
      jafcorBoulderTrips,
      zaffaraBoulderTrips,
      totalBoulderTrips,
      truckTotal,
      quarryDiesel: round2(quarryDiesel),
      totalDiesel: round2(totalDiesel),
      otherDiesel: round2(Math.max(totalDiesel - quarryDiesel, 0)),
      equipment,
      binderAmount,
      jafcorBoulderAmount,
      totalAmount,
    };
  }, [form]);

  const monthStats = useMemo(() => {
    const binderTrips = entries.reduce((sum, entry) => sum + entry.jafcor_binder_trips, 0);
    const boulderTrips = entries.reduce((sum, entry) => sum + entry.total_boulder_trips, 0);
    const truckTotal = entries.reduce((sum, entry) => sum + parseTruckTotal(entry.number_of_trucks), 0);
    const totalDiesel = entries.reduce((sum, entry) => sum + entry.total_diesel_consumption_liters, 0);
    const quarryDiesel = entries.reduce((sum, entry) => sum + entry.quarry_equipment_diesel_liters, 0);
    const totalAmount = entries.reduce((sum, entry) => sum + entry.total_computed_amount, 0);

    return {
      binderTrips,
      boulderTrips,
      truckTotal: round2(truckTotal),
      totalDiesel: round2(totalDiesel),
      quarryDiesel: round2(quarryDiesel),
      totalAmount: round2(totalAmount),
    };
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(entry => (
      entry.entry_date.includes(q) ||
      entry.number_of_trucks.toLowerCase().includes(q) ||
      entry.notes.toLowerCase().includes(q)
    ));
  }, [entries, search]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedEntries = useMemo(() => paginate(filteredEntries, currentPage, PAGE_SIZE), [filteredEntries, currentPage]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (editingId && !canEdit) return;
    if (!editingId && !canAdd) return;

    setSaving(true);
    setError('');

    const payload = {
      entry_date: form.entry_date,
      jafcor_binder_trips: preview.binderTrips,
      jafcor_boulder_trips: preview.jafcorBoulderTrips,
      zaffara_boulder_trips: preview.zaffaraBoulderTrips,
      number_of_trucks: form.number_of_trucks.trim(),
      quarry_equipment_diesel_liters: preview.quarryDiesel,
      total_diesel_consumption_liters: preview.totalDiesel,
      number_of_equipment: preview.equipment,
      notes: form.notes.trim(),
    };

    const result = editingId
      ? await supabase.from('quarry_site_daily_entries').update(payload).eq('id', editingId)
      : await supabase.from('quarry_site_daily_entries').insert(payload);

    if (result.error) {
      setError(result.error.code === '23505'
        ? 'There is already a Quarry Site entry for this date. Open that row to edit it.'
        : result.error.message);
    } else {
      handleReset();
      setSelectedMonth(monthStart(payload.entry_date));
      await fetchData();
    }

    setSaving(false);
  }

  function handleEdit(entry: QuarrySiteDailyEntry) {
    setEditingId(entry.id);
    setForm(entryToForm(entry));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleReset() {
    setEditingId(null);
    setForm(initialForm());
  }

  function handleDelete(entry: QuarrySiteDailyEntry) {
    if (!canDelete) return;
    setDeleteTarget(entry);
  }

  async function handleConfirmDelete() {
    if (!canDelete || !deleteTarget) return;
    setDeleting(true);
    setError('');

    const { error: deleteError } = await supabase
      .from('quarry_site_daily_entries')
      .delete()
      .eq('id', deleteTarget.id);

    if (deleteError) {
      setError(deleteError.message);
      setDeleting(false);
      return;
    }

    setEntries(prev => prev.filter(item => item.id !== deleteTarget.id));
    setDeleteTarget(null);
    setDeleting(false);
  }

  function handleExport() {
    if (!canExport) return;
    const headers = [
      'Date',
      'JAFCOR Binder Trips',
      'Binder Amount',
      'JAFCOR Boulder Trips',
      'ZAFFARA Boulder Trips',
      'Total Boulder Trips',
      'JAFCOR Boulder Amount',
      'Number of Trucks',
      'Truck Total Preview',
      'Diesel Quarry Equipment (L)',
      'Total Diesel Consumption (L)',
      'Number of Equipment',
      'Total Computed Amount',
      'Status',
      'Notes',
    ];
    const rows = filteredEntries.map(entry => [
      entry.entry_date,
      entry.jafcor_binder_trips,
      entry.binder_amount,
      entry.jafcor_boulder_trips,
      entry.zaffara_boulder_trips,
      entry.total_boulder_trips,
      entry.jafcor_boulder_amount,
      entry.number_of_trucks,
      parseTruckTotal(entry.number_of_trucks),
      entry.quarry_equipment_diesel_liters,
      entry.total_diesel_consumption_liters,
      entry.number_of_equipment,
      entry.total_computed_amount,
      statusForEntry(entry),
      entry.notes,
    ]);
    const csv = [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
    downloadTextFile(`quarry-site-${selectedMonth}.csv`, csv, 'text/csv;charset=utf-8');
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mt-1 text-2xl font-bold text-slate-800">Quarry Site Daily Input</h1>
          <p className="mt-0.5 text-sm text-slate-500">Manual QS encoding with auto-computed boulder trips and workbook rate summaries.</p>
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
        <ReadOnlyNotice message="Your account can view Quarry Site records only. Ask a manager if you need to add or edit daily inputs." />
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          icon={<Mountain size={21} />}
          label="Boulder Trips"
          value={whole(monthStats.boulderTrips)}
          detail={`${whole(monthStats.binderTrips)} binder trips`}
          tone="emerald"
        />
        <MetricCard
          icon={<Truck size={21} />}
          label="Truck Count"
          value={fmt(monthStats.truckTotal)}
          detail={`${monthLabel(selectedMonth)} parsed total`}
          tone="sky"
        />
        <MetricCard
          icon={<Fuel size={21} />}
          label="Total Diesel"
          value={`${fmt(monthStats.totalDiesel)} L`}
          detail={`${fmt(monthStats.quarryDiesel)} L quarry equipment`}
          tone="amber"
        />
        <MetricCard
          icon={<Banknote size={21} />}
          label="Computed Amount"
          value={`PHP ${fmt(monthStats.totalAmount)}`}
          detail="Binder + JAFCOR Boulder"
          tone="violet"
        />
        <MetricCard
          icon={<CalendarDays size={21} />}
          label="Entries"
          value={whole(entries.length)}
          detail={`${monthLabel(selectedMonth)} log`}
          tone="slate"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <form onSubmit={handleSubmit} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-lg font-bold text-slate-800">{editingId ? 'Edit QS Daily Input' : 'New QS Daily Input'}</h2>
            <p className="mt-0.5 text-xs text-slate-500">Encode the manual fields from the Quarry Site data sheet.</p>
          </div>

          <div className="space-y-5 p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Date">
                <input
                  type="date"
                  value={form.entry_date}
                  onChange={e => updateForm('entry_date', e.target.value)}
                  className="input"
                  required
                />
              </Field>
              <Field label="JAFCOR Binder">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.jafcor_binder_trips}
                  onChange={e => updateForm('jafcor_binder_trips', e.target.value)}
                  className="input"
                  placeholder="ex. 54"
                />
              </Field>
              <Field label="JAFCOR Boulder">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.jafcor_boulder_trips}
                  onChange={e => updateForm('jafcor_boulder_trips', e.target.value)}
                  className="input"
                  placeholder="ex. 35"
                />
              </Field>
              <Field label="ZAFFARA Boulder">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.zaffara_boulder_trips}
                  onChange={e => updateForm('zaffara_boulder_trips', e.target.value)}
                  className="input"
                  placeholder="ex. 24"
                />
              </Field>
              <Field label="Number of Trucks" helper={preview.truckTotal > 0 ? `${fmt(preview.truckTotal)} parsed` : undefined}>
                <input
                  type="text"
                  value={form.number_of_trucks}
                  onChange={e => updateForm('number_of_trucks', e.target.value)}
                  className="input"
                  placeholder="ex. 7 or 8 / 5"
                />
              </Field>
              <Field label="Number of Equipment">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.number_of_equipment}
                  onChange={e => updateForm('number_of_equipment', e.target.value)}
                  className="input"
                  placeholder="ex. 1"
                />
              </Field>
              <Field label="Diesel Quarry Equipment (L)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.quarry_equipment_diesel_liters}
                  onChange={e => updateForm('quarry_equipment_diesel_liters', e.target.value)}
                  className="input"
                  placeholder="ex. 200"
                />
              </Field>
              <Field label="Total Diesel Consumption (L)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.total_diesel_consumption_liters}
                  onChange={e => updateForm('total_diesel_consumption_liters', e.target.value)}
                  className="input"
                  placeholder="ex. 640"
                />
              </Field>
            </div>

            <Field label="Notes">
              <textarea
                value={form.notes}
                onChange={e => updateForm('notes', e.target.value)}
                className="input min-h-20 resize-y"
                placeholder="Optional encoder notes..."
              />
            </Field>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              {(editingId ? canEdit : canAdd) && (
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-200 transition-colors hover:bg-emerald-600 disabled:opacity-60"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {editingId ? 'Update Daily Input' : 'Save Daily Input'}
                </button>
              )}
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
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
              <ComputedRow label="Total Boulder Trips" value={whole(preview.totalBoulderTrips)} />
              <ComputedRow label="Binder Amount" value={`PHP ${fmt(preview.binderAmount)}`} />
              <ComputedRow label="JAFCOR Boulder Amount" value={`PHP ${fmt(preview.jafcorBoulderAmount)}`} />
              <ComputedRow label="Total Computed Amount" value={`PHP ${fmt(preview.totalAmount)}`} />
              <ComputedRow label="Other QS Diesel" value={`${fmt(preview.otherDiesel)} L`} />
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
                  onChange={e => {
                    const nextMonth = `${e.target.value}-01`;
                    setSelectedMonth(nextMonth);
                    setForm(prev => ({ ...prev, entry_date: nextMonth }));
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
            <h2 className="text-lg font-bold text-slate-800">Recent QS Entries</h2>
            <p className="mt-0.5 text-xs text-slate-500">{monthLabel(selectedMonth)} operations log</p>
          </div>
          <div className="relative min-w-64">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search date, trucks, notes..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
            <Loader2 size={16} className="animate-spin" />
            Loading Quarry Site entries...
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="py-16 text-center">
            <CalendarDays size={34} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-semibold text-slate-600">No Quarry Site entries found</p>
            <p className="mt-1 text-xs text-slate-400">Daily input records for this month will appear here.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-right">Binder</th>
                    <th className="px-4 py-3 text-right">Boulder</th>
                    <th className="px-4 py-3 text-left">Trucks</th>
                    <th className="px-4 py-3 text-right">Diesel</th>
                    <th className="px-4 py-3 text-right">Equipment</th>
                    <th className="px-4 py-3 text-right">Amount</th>
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
                          <p className="max-w-44 truncate text-xs text-slate-400">{entry.notes || 'No notes'}</p>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                          <p className="font-semibold">{whole(entry.jafcor_binder_trips)}</p>
                          <p className="text-xs text-slate-400">PHP {fmt(entry.binder_amount)}</p>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                          <p className="font-semibold">{whole(entry.total_boulder_trips)}</p>
                          <p className="text-xs text-slate-400">J {whole(entry.jafcor_boulder_trips)} / Z {whole(entry.zaffara_boulder_trips)}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          <p className="font-medium">{entry.number_of_trucks || '-'}</p>
                          {parseTruckTotal(entry.number_of_trucks) > 0 && (
                            <p className="text-xs text-slate-400">{fmt(parseTruckTotal(entry.number_of_trucks))} parsed</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-violet-600">
                          <p>{fmt(entry.total_diesel_consumption_liters)} L</p>
                          <p className="text-xs text-slate-400">{fmt(entry.quarry_equipment_diesel_liters)} L quarry</p>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">{whole(entry.number_of_equipment)}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-700">PHP {fmt(entry.total_computed_amount)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(status)}`}>
                            {status}
                          </span>
                        </td>
                        {(canEdit || canDelete) && (
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1.5">
                              {canEdit && (
                                <button
                                  onClick={() => handleEdit(entry)}
                                  className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600"
                                  title="Edit entry"
                                >
                                  <Edit3 size={15} />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  onClick={() => handleDelete(entry)}
                                  disabled={deleting}
                                  className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                  title="Delete entry"
                                >
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
            <Pagination
              page={currentPage}
              pageSize={PAGE_SIZE}
              totalItems={filteredEntries.length}
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      <ActionModal
        open={!!deleteTarget}
        title="Delete Quarry Site Entry"
        description="This entry will be permanently removed from the daily input records."
        variant="danger"
        confirmLabel="Delete Entry"
        loading={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Delete the Quarry Site entry for{' '}
            <span className="font-semibold text-slate-900">{deleteTarget ? formatDate(deleteTarget.entry_date) : ''}</span>?
          </p>

          <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Boulder Trips</p>
              <p className="mt-1 font-bold tabular-nums text-slate-800">{deleteTarget ? whole(deleteTarget.total_boulder_trips) : '0'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Diesel</p>
              <p className="mt-1 font-bold tabular-nums text-slate-800">{deleteTarget ? fmt(deleteTarget.total_diesel_consumption_liters) : '0.00'} L</p>
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
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${toneClass}`}>
        {icon}
      </div>
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
