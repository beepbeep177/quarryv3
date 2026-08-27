import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Download,
  Edit3,
  Gauge,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Truck,
  Waves,
  Zap,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { SandWashingDailyEntry } from '../lib/database.types';
import Pagination from './Pagination';
import ReadOnlyNotice from './ReadOnlyNotice';
import { paginate } from '../lib/pagination';
import ActionModal from './ActionModal';

const PAGE_SIZE = 8;
const VIBRO_CBM_PER_DUMP = 8.4;
const WASTE_CBM_PER_TRUCK = 14;

type ProductOption = 'Vibro' | '3/8-S1' | 'No Operation';
type WasteProductOption = 'Waste' | '3/8' | 'N/A';

interface SandWashingOperationsProps {
  canAdd?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canExport?: boolean;
}

interface EntryForm {
  entry_date: string;
  product: ProductOption;
  operation_hours: string;
  time_of_operation: string;
  number_of_dumps: string;
  genset_diesel_consumption_liters: string;
  number_truck_waste: string;
  waste_product: WasteProductOption;
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

function minutesToHours(minutes: number) {
  return minutes / 60;
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
    product: 'Vibro',
    operation_hours: '',
    time_of_operation: '',
    number_of_dumps: '',
    genset_diesel_consumption_liters: '',
    number_truck_waste: '',
    waste_product: 'Waste',
    notes: '',
  };
}

function normalizeProduct(value: string): ProductOption {
  return value === '3/8-S1' || value === 'No Operation' ? value : 'Vibro';
}

function normalizeWasteProduct(value: string): WasteProductOption {
  return value === '3/8' || value === 'N/A' ? value : 'Waste';
}

function entryToForm(entry: SandWashingDailyEntry): EntryForm {
  return {
    entry_date: entry.entry_date,
    product: normalizeProduct(entry.product),
    operation_hours: String(entry.operation_hours || ''),
    time_of_operation: entry.time_of_operation || '',
    number_of_dumps: String(entry.number_of_dumps || ''),
    genset_diesel_consumption_liters: String(entry.genset_diesel_consumption_liters || ''),
    number_truck_waste: String(entry.number_truck_waste || ''),
    waste_product: normalizeWasteProduct(entry.waste_product),
    notes: entry.notes || '',
  };
}

function statusForEntry(entry: SandWashingDailyEntry) {
  if (entry.product === 'No Operation' || (entry.operation_minutes === 0 && entry.number_of_dumps === 0)) return 'No Operation';
  if ((entry.operation_minutes > 0 && entry.number_of_dumps === 0) || (entry.operation_minutes === 0 && entry.number_of_dumps > 0)) return 'Needs Review';
  return 'Completed';
}

function statusBadgeClass(status: string) {
  if (status === 'Completed') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'Needs Review') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
}

export default function SandWashingOperations({
  canAdd = false,
  canEdit = false,
  canDelete = false,
  canExport = false,
}: SandWashingOperationsProps) {
  const [entries, setEntries] = useState<SandWashingDailyEntry[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(monthStart(todayInput()));
  const [form, setForm] = useState<EntryForm>(() => initialForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SandWashingDailyEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const canManageEntries = canAdd || canEdit || canDelete;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');

    const { data, error: entriesError } = await supabase
      .from('sand_washing_daily_entries')
      .select('*')
      .gte('entry_date', selectedMonth)
      .lte('entry_date', monthEnd(selectedMonth))
      .order('entry_date', { ascending: false });

    if (entriesError) {
      setError(entriesError.message);
    } else {
      setEntries((data ?? []) as SandWashingDailyEntry[]);
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
    const operationHours = parseDecimal(form.operation_hours);
    const operationMinutes = Math.round(operationHours * 60);
    const dumps = parseWhole(form.number_of_dumps);
    const dieselLiters = parseDecimal(form.genset_diesel_consumption_liters);
    const wasteTrucks = parseWhole(form.number_truck_waste);
    const vibroSandVolume = round2(dumps * VIBRO_CBM_PER_DUMP);
    const wasteVolume = round2(wasteTrucks * WASTE_CBM_PER_TRUCK);

    return {
      operationHours: round2(operationHours),
      operationMinutes,
      dumps,
      dieselLiters: round2(dieselLiters),
      wasteTrucks,
      vibroSandVolume,
      wasteVolume,
      dieselConsumptionLph: operationHours > 0 ? round2(dieselLiters / operationHours) : 0,
      status: form.product === 'No Operation' || (operationMinutes === 0 && dumps === 0)
        ? 'No Operation'
        : (operationMinutes > 0 && dumps === 0) || (operationMinutes === 0 && dumps > 0)
          ? 'Needs Review'
          : 'Completed',
    };
  }, [form]);

  const monthStats = useMemo(() => {
    const totalOperationMinutes = entries.reduce((sum, entry) => sum + entry.operation_minutes, 0);
    const totalDumps = entries.reduce((sum, entry) => sum + entry.number_of_dumps, 0);
    const totalVibroVolume = entries.reduce((sum, entry) => sum + entry.vibro_sand_volume_cbm, 0);
    const totalWasteVolume = entries.reduce((sum, entry) => sum + entry.waste_volume_cbm, 0);
    const totalDiesel = entries.reduce((sum, entry) => sum + entry.genset_diesel_consumption_liters, 0);
    const usedHours = round2(minutesToHours(totalOperationMinutes));

    return {
      usedHours,
      totalDumps,
      totalVibroVolume: round2(totalVibroVolume),
      totalWasteVolume: round2(totalWasteVolume),
      totalDiesel: round2(totalDiesel),
      dieselRate: usedHours > 0 ? round2(totalDiesel / usedHours) : 0,
    };
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(entry => (
      entry.entry_date.includes(q) ||
      entry.product.toLowerCase().includes(q) ||
      entry.time_of_operation.toLowerCase().includes(q) ||
      entry.waste_product.toLowerCase().includes(q)
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
      product: form.product,
      operation_minutes: preview.operationMinutes,
      time_of_operation: form.time_of_operation.trim(),
      number_of_dumps: preview.dumps,
      genset_diesel_consumption_liters: preview.dieselLiters,
      number_truck_waste: preview.wasteTrucks,
      waste_product: form.waste_product,
      notes: form.notes.trim(),
    };

    const result = editingId
      ? await supabase.from('sand_washing_daily_entries').update(payload).eq('id', editingId)
      : await supabase.from('sand_washing_daily_entries').insert(payload);

    if (result.error) {
      setError(result.error.code === '23505'
        ? 'There is already a Sand Washing entry for this date. Open that row to edit it.'
        : result.error.message);
    } else {
      handleReset();
      setSelectedMonth(monthStart(payload.entry_date));
      await fetchData();
    }

    setSaving(false);
  }

  function handleEdit(entry: SandWashingDailyEntry) {
    setEditingId(entry.id);
    setForm(entryToForm(entry));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleReset() {
    setEditingId(null);
    setForm(initialForm());
  }

  function handleDelete(entry: SandWashingDailyEntry) {
    if (!canDelete) return;
    setDeleteTarget(entry);
  }

  async function handleConfirmDelete() {
    if (!canDelete || !deleteTarget) return;
    setDeleting(true);
    setError('');

    const { error: deleteError } = await supabase
      .from('sand_washing_daily_entries')
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
      'Product',
      'Operation Minutes',
      'Operation Hours',
      'Time of Operation',
      'Number of Dumps',
      'Genset Diesel Consumption (L)',
      'Daily Diesel Consumption (L/HR)',
      'Vibro Sand Volume (cbm)',
      'Number Truck Waste',
      'Waste Volume (cbm)',
      'Waste Product',
      'Status',
      'Notes',
    ];
    const rows = filteredEntries.map(entry => [
      entry.entry_date,
      entry.product,
      entry.operation_minutes,
      entry.operation_hours,
      entry.time_of_operation,
      entry.number_of_dumps,
      entry.genset_diesel_consumption_liters,
      entry.diesel_consumption_lph,
      entry.vibro_sand_volume_cbm,
      entry.number_truck_waste,
      entry.waste_volume_cbm,
      entry.waste_product,
      statusForEntry(entry),
      entry.notes,
    ]);
    const csv = [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
    downloadTextFile(`sand-washing-${selectedMonth}.csv`, csv, 'text/csv;charset=utf-8');
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mt-1 text-2xl font-bold text-slate-800">Sand Washing Daily Input</h1>
          <p className="mt-0.5 text-sm text-slate-500">Manual daily encoding with auto-computed Vibro Sand, waste, and diesel rate summaries.</p>
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
        <ReadOnlyNotice message="Your account can view Sand Washing records only. Ask a manager if you need to add or edit daily inputs." />
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          icon={<Gauge size={21} />}
          label="Operation Hours"
          value={`${fmt(monthStats.usedHours)} hrs`}
          detail={`${monthLabel(selectedMonth)} total`}
          tone="emerald"
        />
        <MetricCard
          icon={<Truck size={21} />}
          label="Number of Dumps"
          value={whole(monthStats.totalDumps)}
          detail={`${fmt(VIBRO_CBM_PER_DUMP)} cbm per dump`}
          tone="sky"
        />
        <MetricCard
          icon={<Waves size={21} />}
          label="Vibro Sand Volume"
          value={`${fmt(monthStats.totalVibroVolume)} cbm`}
          detail="Auto-computed output"
          tone="amber"
        />
        <MetricCard
          icon={<Truck size={21} />}
          label="Waste Volume"
          value={`${fmt(monthStats.totalWasteVolume)} cbm`}
          detail={`${fmt(WASTE_CBM_PER_TRUCK)} cbm per truck`}
          tone="violet"
        />
        <MetricCard
          icon={<Zap size={21} />}
          label="Diesel Rate"
          value={`${fmt(monthStats.dieselRate)} L/hr`}
          detail={`${fmt(monthStats.totalDiesel)} L recorded`}
          tone="slate"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <form onSubmit={handleSubmit} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-lg font-bold text-slate-800">{editingId ? 'Edit SW Daily Input' : 'New SW Daily Input'}</h2>
            <p className="mt-0.5 text-xs text-slate-500">Encode the manual fields from the Sand Washing data sheet.</p>
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
              <Field label="Product">
                <select
                  value={form.product}
                  onChange={e => updateForm('product', e.target.value as ProductOption)}
                  className="input"
                >
                  <option value="Vibro">Vibro</option>
                  <option value="3/8-S1">3/8-S1</option>
                  <option value="No Operation">No Operation</option>
                </select>
              </Field>
              <Field label="Operation Hours" helper={`${preview.operationMinutes} mins`}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.operation_hours}
                  onChange={e => updateForm('operation_hours', e.target.value)}
                  className="input"
                  placeholder="ex. 8.45"
                />
              </Field>
              <Field label="Time of Operation">
                <input
                  type="text"
                  value={form.time_of_operation}
                  onChange={e => updateForm('time_of_operation', e.target.value)}
                  className="input"
                  placeholder="ex. 8am-7pm"
                />
              </Field>
              <Field label="Number of Dumps">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.number_of_dumps}
                  onChange={e => updateForm('number_of_dumps', e.target.value)}
                  className="input"
                  placeholder="ex. 66"
                />
              </Field>
              <Field label="Genset Diesel Consumption (L)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.genset_diesel_consumption_liters}
                  onChange={e => updateForm('genset_diesel_consumption_liters', e.target.value)}
                  className="input"
                  placeholder="ex. 120"
                />
              </Field>
              <Field label="Number Truck Waste">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.number_truck_waste}
                  onChange={e => updateForm('number_truck_waste', e.target.value)}
                  className="input"
                  placeholder="ex. 16"
                />
              </Field>
              <Field label="Waste Product">
                <select
                  value={form.waste_product}
                  onChange={e => updateForm('waste_product', e.target.value as WasteProductOption)}
                  className="input"
                >
                  <option value="Waste">Waste</option>
                  <option value="3/8">3/8</option>
                  <option value="N/A">N/A</option>
                </select>
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
              <ComputedRow label="Operation Hours" value={`${fmt(preview.operationHours)} hrs`} />
              <ComputedRow label="Number of Dumps" value={whole(preview.dumps)} />
              <ComputedRow label="Vibro Sand Volume" value={`${fmt(preview.vibroSandVolume)} cbm`} />
              <ComputedRow label="Waste Volume" value={`${fmt(preview.wasteVolume)} cbm`} />
              <ComputedRow label="Diesel Rate" value={`${fmt(preview.dieselConsumptionLph)} L/hr`} />
              <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <span className="text-sm text-slate-500">Status</span>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(preview.status)}`}>
                  {preview.status}
                </span>
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
            <h2 className="text-lg font-bold text-slate-800">Recent SW Entries</h2>
            <p className="mt-0.5 text-xs text-slate-500">{monthLabel(selectedMonth)} operations log</p>
          </div>
          <div className="relative min-w-64">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search date, product, schedule..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
            <Loader2 size={16} className="animate-spin" />
            Loading Sand Washing entries...
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="py-16 text-center">
            <CalendarDays size={34} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-semibold text-slate-600">No Sand Washing entries found</p>
            <p className="mt-1 text-xs text-slate-400">Daily input records for this month will appear here.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Product</th>
                    <th className="px-4 py-3 text-right">Op Hrs</th>
                    <th className="px-4 py-3 text-right">Dumps</th>
                    <th className="px-4 py-3 text-right">Diesel</th>
                    <th className="px-4 py-3 text-right">Vibro Volume</th>
                    <th className="px-4 py-3 text-right">Waste</th>
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
                          <p className="max-w-44 truncate text-xs text-slate-400">{entry.time_of_operation || 'No schedule'}</p>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-700">{entry.product}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-emerald-600">{fmt(entry.operation_hours)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">{whole(entry.number_of_dumps)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-violet-600">
                          <p>{fmt(entry.genset_diesel_consumption_liters)} L</p>
                          <p className="text-xs text-slate-400">{fmt(entry.diesel_consumption_lph)} L/hr</p>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">{fmt(entry.vibro_sand_volume_cbm)} cbm</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                          <p>{fmt(entry.waste_volume_cbm)} cbm</p>
                          <p className="text-xs text-slate-400">{whole(entry.number_truck_waste)} truck/s - {entry.waste_product}</p>
                        </td>
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
        title="Delete Sand Washing Entry"
        description="This entry will be permanently removed from the daily input records."
        variant="danger"
        confirmLabel="Delete Entry"
        loading={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Delete the Sand Washing entry for{' '}
            <span className="font-semibold text-slate-900">{deleteTarget ? formatDate(deleteTarget.entry_date) : ''}</span>?
          </p>

          <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Dumps</p>
              <p className="mt-1 font-bold tabular-nums text-slate-800">{deleteTarget ? whole(deleteTarget.number_of_dumps) : '0'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Vibro Volume</p>
              <p className="mt-1 font-bold tabular-nums text-slate-800">{deleteTarget ? fmt(deleteTarget.vibro_sand_volume_cbm) : '0.00'} cbm</p>
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
