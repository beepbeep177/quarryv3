import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Download,
  Edit3,
  Factory,
  Gauge,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Target,
  Trash2,
  Truck,
  Zap,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { StoneCrusherDailyEntry, StoneCrusherMonthlyTarget } from '../lib/database.types';
import Pagination from './Pagination';
import ReadOnlyNotice from './ReadOnlyNotice';
import { paginate } from '../lib/pagination';

const PAGE_SIZE = 8;
const DEFAULT_TARGET_HOURS = 200;
const PRODUCT_RATES = {
  g1: 43,
  threeFourth: 7,
  sThreeFourth: 29,
};

interface StoneCrusherOperationsProps {
  canAdd?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canExport?: boolean;
}

interface EntryForm {
  entry_date: string;
  operation_minutes: string;
  downtime_minutes: string;
  time_schedule: string;
  breakdown: string;
  jaw_1_dumps: string;
  jaw_2_dumps: string;
  genset_1_active: boolean;
  genset_2_active: boolean;
  genset_4_active: boolean;
  water_pump_active: boolean;
  genset_1_liters: string;
  genset_2_liters: string;
  genset_4_liters: string;
  water_pump_genset_liters: string;
  genset_1_running_minutes: string;
  genset_2_running_minutes: string;
  genset_4_running_minutes: string;
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
    operation_minutes: '',
    downtime_minutes: '',
    time_schedule: '',
    breakdown: '',
    jaw_1_dumps: '',
    jaw_2_dumps: '',
    genset_1_active: false,
    genset_2_active: false,
    genset_4_active: false,
    water_pump_active: false,
    genset_1_liters: '',
    genset_2_liters: '',
    genset_4_liters: '',
    water_pump_genset_liters: '',
    genset_1_running_minutes: '',
    genset_2_running_minutes: '',
    genset_4_running_minutes: '',
    notes: '',
  };
}

function entryToForm(entry: StoneCrusherDailyEntry): EntryForm {
  return {
    entry_date: entry.entry_date,
    operation_minutes: String(entry.operation_hours || ''),
    downtime_minutes: String(entry.downtime_hours || ''),
    time_schedule: entry.time_schedule || '',
    breakdown: entry.breakdown || '',
    jaw_1_dumps: String(entry.jaw_1_dumps || ''),
    jaw_2_dumps: String(entry.jaw_2_dumps || ''),
    genset_1_active: entry.genset_1_liters > 0 || entry.genset_1_running_minutes > 0 || entry.genset_used.includes('Genset 1'),
    genset_2_active: entry.genset_2_liters > 0 || entry.genset_2_running_minutes > 0 || entry.genset_used.includes('Genset 2'),
    genset_4_active: entry.genset_4_liters > 0 || entry.genset_4_running_minutes > 0 || entry.genset_used.includes('Genset 4'),
    water_pump_active: entry.water_pump_genset_liters > 0 || entry.genset_used.includes('Water Pump'),
    genset_1_liters: String(entry.genset_1_liters || ''),
    genset_2_liters: String(entry.genset_2_liters || ''),
    genset_4_liters: String(entry.genset_4_liters || ''),
    water_pump_genset_liters: String(entry.water_pump_genset_liters || ''),
    genset_1_running_minutes: String(entry.genset_1_running_minutes || ''),
    genset_2_running_minutes: String(entry.genset_2_running_minutes || ''),
    genset_4_running_minutes: String(entry.genset_4_running_minutes || ''),
    notes: entry.notes || '',
  };
}

function statusForEntry(entry: StoneCrusherDailyEntry) {
  if (entry.operation_minutes === 0 && entry.total_dumps === 0) return 'No Work';
  if (entry.downtime_minutes > 0 || (entry.breakdown && entry.breakdown.toLowerCase() !== 'no breakdown')) return 'With Downtime';
  return 'Completed';
}

function statusBadgeClass(status: string) {
  if (status === 'Completed') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'With Downtime') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
}

export default function StoneCrusherOperations({
  canAdd = false,
  canEdit = false,
  canDelete = false,
  canExport = false,
}: StoneCrusherOperationsProps) {
  const [entries, setEntries] = useState<StoneCrusherDailyEntry[]>([]);
  const [target, setTarget] = useState<StoneCrusherMonthlyTarget | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(monthStart(todayInput()));
  const [targetForm, setTargetForm] = useState({
    target_hours: String(DEFAULT_TARGET_HOURS),
    effective_date: monthStart(todayInput()),
    remarks: '',
  });
  const [form, setForm] = useState<EntryForm>(() => initialForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingTarget, setSavingTarget] = useState(false);
  const [error, setError] = useState('');
  const canManageEntries = canAdd || canEdit || canDelete;
  const canManageTarget = canEdit;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');

    const start = selectedMonth;
    const end = monthEnd(selectedMonth);
    const [entriesResult, targetResult] = await Promise.all([
      supabase
        .from('stone_crusher_daily_entries')
        .select('*')
        .gte('entry_date', start)
        .lte('entry_date', end)
        .order('entry_date', { ascending: false }),
      supabase
        .from('stone_crusher_monthly_targets')
        .select('*')
        .eq('target_month', start)
        .maybeSingle(),
    ]);

    if (entriesResult.error) {
      setError(entriesResult.error.message);
    } else {
      setEntries((entriesResult.data ?? []) as StoneCrusherDailyEntry[]);
    }

    if (targetResult.error) {
      setTarget(null);
      setTargetForm({
        target_hours: String(DEFAULT_TARGET_HOURS),
        effective_date: start,
        remarks: '',
      });
    } else {
      const nextTarget = targetResult.data as StoneCrusherMonthlyTarget | null;
      setTarget(nextTarget);
      setTargetForm({
        target_hours: String(nextTarget?.target_hours ?? DEFAULT_TARGET_HOURS),
        effective_date: nextTarget?.effective_date ?? start,
        remarks: nextTarget?.remarks ?? '',
      });
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
    const operationHours = parseDecimal(form.operation_minutes);
    const downtimeHours = parseDecimal(form.downtime_minutes);
    const operationMinutes = Math.round(operationHours * 60);
    const downtimeMinutes = Math.round(downtimeHours * 60);
    const jaw1 = parseWhole(form.jaw_1_dumps);
    const jaw2 = parseWhole(form.jaw_2_dumps);
    const genset1Liters = form.genset_1_active ? parseDecimal(form.genset_1_liters) : 0;
    const genset2Liters = form.genset_2_active ? parseDecimal(form.genset_2_liters) : 0;
    const genset4Liters = form.genset_4_active ? parseDecimal(form.genset_4_liters) : 0;
    const waterPumpLiters = form.water_pump_active ? parseDecimal(form.water_pump_genset_liters) : 0;
    const g1Output = round2(PRODUCT_RATES.g1 * operationHours);
    const threeFourthOutput = round2(PRODUCT_RATES.threeFourth * operationHours);
    const sThreeFourthOutput = round2(PRODUCT_RATES.sThreeFourth * operationHours);
    const totalOutput = round2(g1Output + threeFourthOutput + sThreeFourthOutput);

    return {
      operationMinutes,
      downtimeMinutes,
      operationHours: round2(operationHours),
      downtimeHours: round2(downtimeHours),
      totalDumps: jaw1 + jaw2,
      gensetDiesel: round2(genset1Liters + genset2Liters + genset4Liters + waterPumpLiters),
      g1Output,
      threeFourthOutput,
      sThreeFourthOutput,
      totalOutput,
      plantCapacityTph: operationHours > 0 ? round2(totalOutput / operationHours) : 0,
      gensetUsed: [
        form.genset_1_active ? 'Genset 1' : '',
        form.genset_2_active ? 'Genset 2' : '',
        form.genset_4_active ? 'Genset 4' : '',
        form.water_pump_active ? 'Water Pump Genset' : '',
      ].filter(Boolean).join(', '),
    };
  }, [form]);

  const monthStats = useMemo(() => {
    const usedMinutes = entries.reduce((sum, entry) => sum + entry.operation_minutes, 0);
    const targetHours = target?.target_hours ?? DEFAULT_TARGET_HOURS;
    const totalDumps = entries.reduce((sum, entry) => sum + entry.total_dumps, 0);
    const totalDiesel = entries.reduce((sum, entry) => sum + entry.genset_diesel_consumption, 0);
    const totalOutput = entries.reduce((sum, entry) => sum + entry.total_output, 0);
    const usedHours = round2(minutesToHours(usedMinutes));
    return {
      targetHours,
      usedHours,
      remainingHours: round2(Math.max(targetHours - usedHours, 0)),
      totalDumps,
      totalDiesel: round2(totalDiesel),
      totalOutput: round2(totalOutput),
      averageCapacity: usedHours > 0 ? round2(totalOutput / usedHours) : 0,
    };
  }, [entries, target]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(entry => (
      entry.entry_date.includes(q) ||
      entry.time_schedule.toLowerCase().includes(q) ||
      entry.breakdown.toLowerCase().includes(q) ||
      entry.genset_used.toLowerCase().includes(q)
    ));
  }, [entries, search]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedEntries = useMemo(() => paginate(filteredEntries, currentPage, PAGE_SIZE), [filteredEntries, currentPage]);

  async function handleSaveTarget() {
    if (!canManageTarget) return;
    setSavingTarget(true);
    setError('');

    const targetHours = parseDecimal(targetForm.target_hours) || DEFAULT_TARGET_HOURS;
    const payload = {
      target_month: selectedMonth,
      target_hours: targetHours,
      effective_date: targetForm.effective_date || selectedMonth,
      remarks: targetForm.remarks.trim(),
    };

    const { error: targetError } = await supabase
      .from('stone_crusher_monthly_targets')
      .upsert(payload, { onConflict: 'target_month' })
      .select()
      .single();

    if (targetError) {
      setError(targetError.message);
    } else {
      await fetchData();
    }

    setSavingTarget(false);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
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
      monthly_target_id: target?.id ?? null,
      jaw_1_dumps: parseWhole(form.jaw_1_dumps),
      jaw_2_dumps: parseWhole(form.jaw_2_dumps),
      genset_used: preview.gensetUsed,
      genset_1_liters: form.genset_1_active ? parseDecimal(form.genset_1_liters) : 0,
      genset_2_liters: form.genset_2_active ? parseDecimal(form.genset_2_liters) : 0,
      genset_4_liters: form.genset_4_active ? parseDecimal(form.genset_4_liters) : 0,
      water_pump_genset_liters: form.water_pump_active ? parseDecimal(form.water_pump_genset_liters) : 0,
      genset_1_running_minutes: form.genset_1_active ? parseWhole(form.genset_1_running_minutes) : 0,
      genset_2_running_minutes: form.genset_2_active ? parseWhole(form.genset_2_running_minutes) : 0,
      genset_4_running_minutes: form.genset_4_active ? parseWhole(form.genset_4_running_minutes) : 0,
      notes: form.notes.trim(),
    };

    const result = editingId
      ? await supabase.from('stone_crusher_daily_entries').update(payload).eq('id', editingId)
      : await supabase.from('stone_crusher_daily_entries').insert(payload);

    if (result.error) {
      setError(result.error.code === '23505'
        ? 'There is already a Stone Crusher entry for this date. Open that row to edit it.'
        : result.error.message);
    } else {
      handleReset();
      setSelectedMonth(monthStart(payload.entry_date));
      await fetchData();
    }

    setSaving(false);
  }

  function handleEdit(entry: StoneCrusherDailyEntry) {
    setEditingId(entry.id);
    setForm(entryToForm(entry));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleReset() {
    setEditingId(null);
    setForm(initialForm());
  }

  async function handleDelete(entry: StoneCrusherDailyEntry) {
    if (!canDelete) return;
    if (!confirm(`Delete Stone Crusher entry for ${formatDate(entry.entry_date)}?`)) return;
    setError('');
    const { error: deleteError } = await supabase
      .from('stone_crusher_daily_entries')
      .delete()
      .eq('id', entry.id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setEntries(prev => prev.filter(item => item.id !== entry.id));
  }

  function handleExport() {
    if (!canExport) return;
    const headers = [
      'Date',
      'Operation Minutes',
      'Operation Hours',
      'Downtime Minutes',
      'Downtime Hours',
      'Time Schedule',
      'Breakdown',
      'Jaw 1 Dumps',
      'Jaw 2 Dumps',
      'Total Dumps',
      'Genset Used',
      'Genset 1 Liters',
      'Genset 2 Liters',
      'Genset 4 Liters',
      'Water Pump Liters',
      'Total Diesel Liters',
      'G1 Output',
      '3/4 Output',
      'S-3/4 Output',
      'Total Output',
      'Plant Capacity TPH',
      'Notes',
    ];
    const rows = filteredEntries.map(entry => [
      entry.entry_date,
      entry.operation_minutes,
      entry.operation_hours,
      entry.downtime_minutes,
      entry.downtime_hours,
      entry.time_schedule,
      entry.breakdown,
      entry.jaw_1_dumps,
      entry.jaw_2_dumps,
      entry.total_dumps,
      entry.genset_used,
      entry.genset_1_liters,
      entry.genset_2_liters,
      entry.genset_4_liters,
      entry.water_pump_genset_liters,
      entry.genset_diesel_consumption,
      entry.g1_output,
      entry.three_fourth_output,
      entry.s_three_fourth_output,
      entry.total_output,
      entry.plant_capacity_tph,
      entry.notes,
    ]);
    const csv = [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
    downloadTextFile(`stone-crusher-${selectedMonth}.csv`, csv, 'text/csv;charset=utf-8');
  }

  const gensetOptions = [
    {
      key: 'genset_1_active' as const,
      label: 'Genset 1',
      litersKey: 'genset_1_liters' as const,
      runningKey: 'genset_1_running_minutes' as const,
    },
    {
      key: 'genset_2_active' as const,
      label: 'Genset 2',
      litersKey: 'genset_2_liters' as const,
      runningKey: 'genset_2_running_minutes' as const,
    },
    {
      key: 'genset_4_active' as const,
      label: 'Genset 4',
      litersKey: 'genset_4_liters' as const,
      runningKey: 'genset_4_running_minutes' as const,
    },
    {
      key: 'water_pump_active' as const,
      label: 'Water Pump Genset',
      litersKey: 'water_pump_genset_liters' as const,
      runningKey: null,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {/* <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600">Phase 3 Operations</p> */}
          <h1 className="text-2xl font-bold text-slate-800 mt-1">Stone Crusher Daily Input</h1>
          <p className="text-slate-500 text-sm mt-0.5">Manual daily encoding with auto-computed production and diesel summaries.</p>
        </div>
        <div className="flex items-center gap-2">
          {canExport && (
            <button
              onClick={handleExport}
              disabled={filteredEntries.length === 0}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Download size={15} />
              Export
            </button>
          )}
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {!canManageEntries && <ReadOnlyNotice message="This user group can review Stone Crusher operations only." />}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={<Target size={20} />} label="Target Remaining" value={`${fmt(monthStats.remainingHours)} hrs`} detail={`of ${fmt(monthStats.targetHours)} hrs`} tone="emerald" />
        <MetricCard icon={<Gauge size={20} />} label="Operation Hours" value={`${fmt(monthStats.usedHours)} hrs`} detail={monthLabel(selectedMonth)} tone="sky" />
        <MetricCard icon={<Truck size={20} />} label="Total Dumps" value={whole(monthStats.totalDumps)} detail="Jaw 1 + Jaw 2" tone="amber" />
        <MetricCard icon={<Zap size={20} />} label="Diesel Recorded" value={`${fmt(monthStats.totalDiesel)} L`} detail="operations record only" tone="violet" />
        <MetricCard icon={<Factory size={20} />} label="Avg Capacity" value={`${fmt(monthStats.averageCapacity)} TPH`} detail="computed output rate" tone="slate" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Daily Manual Input</h2>
              <p className="text-xs text-slate-500 mt-0.5">{editingId ? 'Editing saved entry' : 'New Stone Crusher entry'}</p>
            </div>
            {editingId && (
              <span className="px-2.5 py-1 rounded-full border border-amber-200 bg-amber-50 text-amber-700 text-xs font-semibold">
                Edit mode
              </span>
            )}
          </div>

          <div className="p-5 space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Date">
                <input
                  type="date"
                  value={form.entry_date}
                  onChange={e => {
                    updateForm('entry_date', e.target.value);
                    setSelectedMonth(monthStart(e.target.value));
                  }}
                  className="input"
                  required
                />
              </Field>
              <Field label="Operation Hours" helper={`${whole(preview.operationMinutes)} mins`}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.operation_minutes}
                  onChange={e => updateForm('operation_minutes', e.target.value)}
                  className="input"
                  placeholder="ex. 8"
                />
              </Field>
              <Field label="Downtime Hours" helper={`${whole(preview.downtimeMinutes)} mins`}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.downtime_minutes}
                  onChange={e => updateForm('downtime_minutes', e.target.value)}
                  className="input"
                  placeholder="ex. 1"
                />
              </Field>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
              <Field label="Time Schedule">
                <input
                  type="text"
                  value={form.time_schedule}
                  onChange={e => updateForm('time_schedule', e.target.value)}
                  className="input"
                  placeholder="ex. 8am-5pm"
                />
              </Field>
              <Field label="Breakdown / Reason">
                <input
                  type="text"
                  value={form.breakdown}
                  onChange={e => updateForm('breakdown', e.target.value)}
                  className="input"
                  placeholder="ex. No breakdown, heavy rain, repair..."
                />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Number of Dumps Jaw 1">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.jaw_1_dumps}
                  onChange={e => updateForm('jaw_1_dumps', e.target.value)}
                  className="input"
                  placeholder="0"
                />
              </Field>
              <Field label="Number of Dumps Jaw 2">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.jaw_2_dumps}
                  onChange={e => updateForm('jaw_2_dumps', e.target.value)}
                  className="input"
                  placeholder="0"
                />
              </Field>
            </div>

            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-bold text-slate-700">Genset Diesel Inputs</h3>
                <p className="text-xs text-slate-500 mt-0.5">Select only the gensets used that day, then encode liters and running minutes.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {gensetOptions.map(option => {
                  const active = form[option.key];
                  return (
                    <div key={option.key} className={`rounded-lg border p-4 transition-colors ${active ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'}`}>
                      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={e => updateForm(option.key, e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        {option.label}
                      </label>
                      <div className="grid gap-3 mt-3 sm:grid-cols-2">
                        <Field label="Liters">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            disabled={!active}
                            value={form[option.litersKey]}
                            onChange={e => updateForm(option.litersKey, e.target.value)}
                            className="input disabled:bg-slate-50 disabled:text-slate-400"
                            placeholder="0.00"
                          />
                        </Field>
                        {option.runningKey ? (
                          <Field label="Running Minutes" helper={`${fmt(minutesToHours(parseWhole(form[option.runningKey])))} hrs`}>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              disabled={!active}
                              value={form[option.runningKey]}
                              onChange={e => updateForm(option.runningKey!, e.target.value)}
                              className="input disabled:bg-slate-50 disabled:text-slate-400"
                              placeholder="0"
                            />
                          </Field>
                        ) : (
                          <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-500">
                            Running minutes not required
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
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
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors shadow-sm shadow-emerald-200 disabled:opacity-60"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {editingId ? 'Update Daily Input' : 'Save Daily Input'}
                </button>
              )}
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-semibold transition-colors"
              >
                <RotateCcw size={16} />
                Reset
              </button>
            </div>
          </div>
        </form>

        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Auto-Computed Preview</h2>
              <p className="text-xs text-slate-500 mt-0.5">Preview updates before saving.</p>
            </div>
            <div className="p-5 space-y-3">
              <ComputedRow label="Operation Hours" value={`${fmt(preview.operationHours)} hrs`} />
              <ComputedRow label="Downtime Hours" value={`${fmt(preview.downtimeHours)} hrs`} />
              <ComputedRow label="Total Dumps" value={whole(preview.totalDumps)} />
              <ComputedRow label="Genset Diesel Consumption" value={`${fmt(preview.gensetDiesel)} L`} />
              <ComputedRow label="G1 Output" value={`${fmt(preview.g1Output)} tons`} />
              <ComputedRow label="3/4 Output" value={`${fmt(preview.threeFourthOutput)} tons`} />
              <ComputedRow label="S-3/4 Output" value={`${fmt(preview.sThreeFourthOutput)} tons`} />
              <ComputedRow label="Plant Capacity" value={`${fmt(preview.plantCapacityTph)} TPH`} />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Monthly Target</h2>
              <p className="text-xs text-slate-500 mt-0.5">Default is 200 hours. Set once per month when needed.</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
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
                <Field label="Target Hours">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={targetForm.target_hours}
                    onChange={e => setTargetForm(prev => ({ ...prev, target_hours: e.target.value }))}
                    disabled={!canManageTarget}
                    className="input disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </Field>
              </div>
              <Field label="Effective Date">
                <input
                  type="date"
                  value={targetForm.effective_date}
                  onChange={e => setTargetForm(prev => ({ ...prev, effective_date: e.target.value }))}
                  disabled={!canManageTarget}
                  className="input disabled:bg-slate-50 disabled:text-slate-400"
                />
              </Field>
              <Field label="Target Notes">
                <input
                  type="text"
                  value={targetForm.remarks}
                  onChange={e => setTargetForm(prev => ({ ...prev, remarks: e.target.value }))}
                  disabled={!canManageTarget}
                  className="input disabled:bg-slate-50 disabled:text-slate-400"
                  placeholder="Optional month target note"
                />
              </Field>
              {canManageTarget && (
                <button
                  type="button"
                  onClick={handleSaveTarget}
                  disabled={savingTarget}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  {savingTarget ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save Target
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Recent SC Entries</h2>
            <p className="text-xs text-slate-500 mt-0.5">{monthLabel(selectedMonth)} operations log</p>
          </div>
          <div className="relative min-w-64">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search date, schedule, breakdown..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 bg-white"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-16 flex items-center justify-center gap-2 text-sm text-slate-400">
            <Loader2 size={16} className="animate-spin" />
            Loading Stone Crusher entries...
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="py-16 text-center">
            <CalendarDays size={34} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-600">No Stone Crusher entries found</p>
            <p className="text-xs text-slate-400 mt-1">Daily input records for this month will appear here.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-right">Op Hrs</th>
                    <th className="px-4 py-3 text-right">Down Hrs</th>
                    <th className="px-4 py-3 text-right">Dumps</th>
                    <th className="px-4 py-3 text-left">Genset Used</th>
                    <th className="px-4 py-3 text-right">Diesel (L)</th>
                    <th className="px-4 py-3 text-right">Output</th>
                    <th className="px-4 py-3 text-right">Capacity</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    {(canEdit || canDelete) && <th className="px-4 py-3"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedEntries.map(entry => {
                    const status = statusForEntry(entry);
                    return (
                      <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-700">{formatDate(entry.entry_date)}</p>
                          <p className="text-xs text-slate-400 truncate max-w-44">{entry.time_schedule || 'No schedule'}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-600 tabular-nums">{fmt(entry.operation_hours)}</td>
                        <td className="px-4 py-3 text-right text-amber-600 tabular-nums">{fmt(entry.downtime_hours)}</td>
                        <td className="px-4 py-3 text-right text-slate-700 tabular-nums">{whole(entry.total_dumps)}</td>
                        <td className="px-4 py-3 text-slate-600 max-w-44">
                          <p className="truncate" title={entry.genset_used || undefined}>{entry.genset_used || '-'}</p>
                        </td>
                        <td className="px-4 py-3 text-right text-violet-600 tabular-nums">{fmt(entry.genset_diesel_consumption)}</td>
                        <td className="px-4 py-3 text-right text-slate-700 tabular-nums">{fmt(entry.total_output)}</td>
                        <td className="px-4 py-3 text-right text-slate-700 tabular-nums">{fmt(entry.plant_capacity_tph)} TPH</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex px-2.5 py-1 rounded-full border text-xs font-semibold ${statusBadgeClass(status)}`}>
                            {status}
                          </span>
                        </td>
                        {(canEdit || canDelete) && (
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1.5">
                              {canEdit && (
                                <button
                                  onClick={() => handleEdit(entry)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                                  title="Edit entry"
                                >
                                  <Edit3 size={15} />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  onClick={() => handleDelete(entry)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
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
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-4 flex items-center gap-4">
      <div className={`h-11 w-11 rounded-full flex items-center justify-center shrink-0 ${toneClass}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 truncate">{label}</p>
        <p className="text-xl font-bold text-slate-800 tabular-nums mt-1">{value}</p>
        <p className="text-xs text-slate-400 truncate mt-1">{detail}</p>
      </div>
    </div>
  );
}

function Field({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-2 mb-1.5">
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
      <span className="text-sm font-bold text-slate-800 tabular-nums">{value}</span>
    </div>
  );
}
