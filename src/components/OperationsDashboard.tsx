import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Cog,
  Download,
  Factory,
  Fuel,
  Gauge,
  Loader2,
  Mountain,
  RefreshCw,
  Truck,
  Waves,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchAllPages } from '../lib/fetchAll';
import NoOperationButton from './NoOperationButton';
import { todayBusinessDate } from '../lib/date';
import type { NavSection } from '../types';
import {
  buildOperationsDaySummaries,
  buildOperationsDaySummary,
  type OperationsAccess,
  type OperationsData,
  type OperationsDaySummary,
  type OperationsStatus,
} from '../lib/operationsDashboard';

interface OperationsDashboardProps {
  access: OperationsAccess;
  moduleNavigation: OperationsAccess;
  /** Modules where this user may tag a day as "No Operation". */
  canMarkNoOperation?: OperationsAccess;
  onNavigate: (section: NavSection) => void;
}

type ViewMode = 'day' | 'week' | 'month';

const EMPTY_DATA: OperationsData = {
  stoneCrusher: [],
  sandWashing: [],
  quarrySite: [],
  wobbler: [],
};

function todayInput() {
  return todayBusinessDate();
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function inputDate(value: Date) {
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function addDays(value: string, amount: number) {
  const date = parseDate(value);
  date.setDate(date.getDate() + amount);
  return inputDate(date);
}

function monthBounds(value: string) {
  const date = parseDate(value);
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: inputDate(start), end: inputDate(end) };
}

/** Monday-to-Sunday week containing the given date. */
function weekBounds(value: string) {
  const day = parseDate(value).getDay();
  const start = addDays(value, day === 0 ? -6 : 1 - day);
  return { start, end: addDays(start, 6) };
}

function formatWeekLabel(start: string, end: string) {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  const sameMonth = startDate.getMonth() === endDate.getMonth();
  const sameYear = startDate.getFullYear() === endDate.getFullYear();
  const startLabel = startDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
  const endLabel = endDate.toLocaleDateString('en-PH', { ...(sameMonth ? {} : { month: 'short' }), day: 'numeric', year: 'numeric' });
  return `${startLabel} – ${endLabel}`;
}

function datesBetween(start: string, end: string) {
  const dates: string[] = [];
  for (let current = start; current <= end; current = addDays(current, 1)) dates.push(current);
  return dates;
}

function formatDate(value: string, options?: Intl.DateTimeFormatOptions) {
  return parseDate(value).toLocaleDateString('en-PH', options ?? {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatNumber(value: number, digits = 2) {
  return value.toLocaleString('en-PH', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatHours(minutes: number) {
  return `${formatNumber(minutes / 60)} hrs`;
}

function rateFor(total: number, operationMinutes: number) {
  return operationMinutes > 0 ? total / (operationMinutes / 60) : 0;
}

function statusBadgeClass(status: OperationsStatus) {
  if (status === 'Completed') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'With Downtime') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'Needs Review') return 'border-orange-200 bg-orange-50 text-orange-700';
  if (status === 'No Operation') return 'border-slate-200 bg-slate-50 text-slate-600';
  return 'border-rose-200 bg-rose-50 text-rose-700';
}

function escapeCsv(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const csv = rows.map(row => row.map(escapeCsv).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function KpiCard({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-0.5 text-xl font-bold text-slate-900">{value}</p>
          <p className="mt-0.5 truncate text-xs text-slate-400">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function ModulePanel({
  title,
  icon,
  status,
  metrics,
  onOpen,
  footerAction,
}: {
  title: string;
  icon: React.ReactNode;
  status?: OperationsStatus;
  metrics: Array<{ label: string; value: string }>;
  onOpen?: () => void;
  footerAction?: React.ReactNode;
}) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="text-slate-500">{icon}</span>
          <h3 className="truncate text-sm font-bold text-slate-900">{title}</h3>
        </div>
        {status && (
          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusBadgeClass(status)}`}>
            {status}
          </span>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-5 gap-y-4 px-4 py-4 sm:grid-cols-3">
        {metrics.map(metric => (
          <div key={metric.label} className="min-w-0">
            <dt className="text-[11px] font-medium uppercase text-slate-500">{metric.label}</dt>
            <dd className="mt-1 break-words text-sm font-semibold text-slate-900">{metric.value}</dd>
          </div>
        ))}
      </dl>
      {(onOpen || footerAction) && (
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-2.5">
          <div>{footerAction}</div>
          {onOpen && (
            <button
              type="button"
              onClick={onOpen}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
            >
              Open module <ArrowRight size={14} />
            </button>
          )}
        </div>
      )}
    </article>
  );
}

interface ChartDatum {
  date: string;
  diesel: number;
  scProduction: number;
  swProduction: number;
  operationHours: number;
  downtimeHours: number;
}

const CHART_WIDTH = 640;
const CHART_HEIGHT = 220;
const CHART_LEFT = 46;
const CHART_RIGHT = 12;
const CHART_TOP = 14;
const CHART_BOTTOM = 34;

function chartLabel(value: string) {
  return formatDate(value, { month: 'short', day: 'numeric' });
}

function chartTicks(maxValue: number) {
  const max = maxValue > 0 ? maxValue : 1;
  return Array.from({ length: 5 }, (_, index) => (max / 4) * index);
}

function ChartShell({
  title,
  subtitle,
  legend,
  children,
}: {
  title: string;
  subtitle: string;
  legend: Array<{ label: string; color: string }>;
  children: React.ReactNode;
}) {
  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
          </div>
          <BarChart3 size={17} className="shrink-0 text-slate-400" />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {legend.map(item => (
            <span key={item.label} className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-500">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      </div>
      <div className="aspect-[16/6.5] min-h-52 w-full px-2 py-3">{children}</div>
    </article>
  );
}

function ChartGrid({ maxValue, unit }: { maxValue: number; unit: string }) {
  const plotHeight = CHART_HEIGHT - CHART_TOP - CHART_BOTTOM;
  const ticks = chartTicks(maxValue);
  return (
    <>
      {ticks.map((tick, index) => {
        const y = CHART_HEIGHT - CHART_BOTTOM - (index / 4) * plotHeight;
        return (
          <g key={tick}>
            <line x1={CHART_LEFT} x2={CHART_WIDTH - CHART_RIGHT} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" />
            <text x={CHART_LEFT - 7} y={y + 3} textAnchor="end" fill="#94a3b8" fontSize="9">
              {formatNumber(tick, tick >= 10 ? 0 : 1)}
            </text>
          </g>
        );
      })}
      <text x="8" y="11" fill="#94a3b8" fontSize="9">{unit}</text>
    </>
  );
}

function ChartXAxis({ data }: { data: ChartDatum[] }) {
  const plotWidth = CHART_WIDTH - CHART_LEFT - CHART_RIGHT;
  const step = Math.max(1, Math.ceil(data.length / 7));
  return (
    <>
      {data.map((item, index) => {
        if (index % step !== 0 && index !== data.length - 1) return null;
        const x = CHART_LEFT + ((index + 0.5) / Math.max(1, data.length)) * plotWidth;
        return <text key={item.date} x={x} y={CHART_HEIGHT - 9} textAnchor="middle" fill="#94a3b8" fontSize="9">{chartLabel(item.date)}</text>;
      })}
    </>
  );
}

function DieselLineChart({ data }: { data: ChartDatum[] }) {
  const plotWidth = CHART_WIDTH - CHART_LEFT - CHART_RIGHT;
  const plotHeight = CHART_HEIGHT - CHART_TOP - CHART_BOTTOM;
  const maxValue = Math.max(0, ...data.map(item => item.diesel));
  const scaleMax = maxValue > 0 ? maxValue : 1;
  const points = data.map((item, index) => ({
    ...item,
    x: CHART_LEFT + ((index + 0.5) / Math.max(1, data.length)) * plotWidth,
    y: CHART_HEIGHT - CHART_BOTTOM - (item.diesel / scaleMax) * plotHeight,
  }));

  return (
    <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="h-full w-full" role="img" aria-label="Operations diesel trend">
      <ChartGrid maxValue={maxValue} unit="L" />
      <ChartXAxis data={data} />
      {maxValue === 0 ? (
        <text x={CHART_WIDTH / 2} y={CHART_HEIGHT / 2} textAnchor="middle" fill="#94a3b8" fontSize="12">No diesel recorded</text>
      ) : (
        <>
          <polyline
            points={points.map(point => `${point.x},${point.y}`).join(' ')}
            fill="none"
            stroke="#d97706"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {points.map(point => (
            <circle key={point.date} cx={point.x} cy={point.y} r="4" fill="#ffffff" stroke="#d97706" strokeWidth="2">
              <title>{`${chartLabel(point.date)}: ${formatNumber(point.diesel)} L`}</title>
            </circle>
          ))}
        </>
      )}
    </svg>
  );
}

function ProductionBarChart({ data }: { data: ChartDatum[] }) {
  const plotWidth = CHART_WIDTH - CHART_LEFT - CHART_RIGHT;
  const plotHeight = CHART_HEIGHT - CHART_TOP - CHART_BOTTOM;
  const maxValue = Math.max(0, ...data.flatMap(item => [item.scProduction, item.swProduction]));
  const scaleMax = maxValue > 0 ? maxValue : 1;
  const groupWidth = plotWidth / Math.max(1, data.length);
  const barWidth = Math.max(2, Math.min(13, groupWidth * 0.3));

  return (
    <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="h-full w-full" role="img" aria-label="Stone Crusher and Sand Washing production chart">
      <ChartGrid maxValue={maxValue} unit="cbm" />
      <ChartXAxis data={data} />
      {maxValue === 0 ? (
        <text x={CHART_WIDTH / 2} y={CHART_HEIGHT / 2} textAnchor="middle" fill="#94a3b8" fontSize="12">No production recorded</text>
      ) : data.map((item, index) => {
        const center = CHART_LEFT + (index + 0.5) * groupWidth;
        const scHeight = (item.scProduction / scaleMax) * plotHeight;
        const swHeight = (item.swProduction / scaleMax) * plotHeight;
        return (
          <g key={item.date}>
            <rect x={center - barWidth - 1} y={CHART_HEIGHT - CHART_BOTTOM - scHeight} width={barWidth} height={scHeight} rx="2" fill="#0284c7">
              <title>{`${chartLabel(item.date)} SC: ${formatNumber(item.scProduction)} cbm`}</title>
            </rect>
            <rect x={center + 1} y={CHART_HEIGHT - CHART_BOTTOM - swHeight} width={barWidth} height={swHeight} rx="2" fill="#7c3aed">
              <title>{`${chartLabel(item.date)} SW: ${formatNumber(item.swProduction)} cbm`}</title>
            </rect>
          </g>
        );
      })}
    </svg>
  );
}

function HoursBarChart({ data }: { data: ChartDatum[] }) {
  const plotWidth = CHART_WIDTH - CHART_LEFT - CHART_RIGHT;
  const plotHeight = CHART_HEIGHT - CHART_TOP - CHART_BOTTOM;
  const maxValue = Math.max(0, ...data.map(item => item.operationHours + item.downtimeHours));
  const scaleMax = maxValue > 0 ? maxValue : 1;
  const groupWidth = plotWidth / Math.max(1, data.length);
  const barWidth = Math.max(3, Math.min(20, groupWidth * 0.58));

  return (
    <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="h-full w-full" role="img" aria-label="Operation and downtime hours chart">
      <ChartGrid maxValue={maxValue} unit="hrs" />
      <ChartXAxis data={data} />
      {maxValue === 0 ? (
        <text x={CHART_WIDTH / 2} y={CHART_HEIGHT / 2} textAnchor="middle" fill="#94a3b8" fontSize="12">No tracked hours recorded</text>
      ) : data.map((item, index) => {
        const x = CHART_LEFT + (index + 0.5) * groupWidth - barWidth / 2;
        const operationHeight = (item.operationHours / scaleMax) * plotHeight;
        const downtimeHeight = (item.downtimeHours / scaleMax) * plotHeight;
        const operationY = CHART_HEIGHT - CHART_BOTTOM - operationHeight;
        const downtimeY = operationY - downtimeHeight;
        return (
          <g key={item.date}>
            <rect x={x} y={operationY} width={barWidth} height={operationHeight} rx="2" fill="#10b981">
              <title>{`${chartLabel(item.date)} operation: ${formatNumber(item.operationHours)} hrs`}</title>
            </rect>
            <rect x={x} y={downtimeY} width={barWidth} height={downtimeHeight} rx="2" fill="#f59e0b">
              <title>{`${chartLabel(item.date)} downtime: ${formatNumber(item.downtimeHours)} hrs`}</title>
            </rect>
          </g>
        );
      })}
    </svg>
  );
}

function CompletenessBars({ rows }: { rows: OperationsDaySummary[] }) {
  return (
    <div className="space-y-3">
      {rows.map(row => (
        <div key={row.date} className="grid grid-cols-[58px_1fr_48px] items-center gap-3">
          <span className="text-xs font-medium text-slate-500">
            {formatDate(row.date, { month: 'short', day: 'numeric' })}
          </span>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${row.completenessPercent === 100 ? 'bg-emerald-500' : 'bg-amber-400'}`}
              style={{ width: `${row.completenessPercent}%` }}
            />
          </div>
          <span className="text-right text-xs font-semibold text-slate-700">{row.submittedCount}/{row.expectedCount}</span>
        </div>
      ))}
    </div>
  );
}

export default function OperationsDashboard({ access, moduleNavigation, canMarkNoOperation, onNavigate }: OperationsDashboardProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [selectedDate, setSelectedDate] = useState(todayInput());
  const [data, setData] = useState<OperationsData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const selectedMonth = selectedDate.slice(0, 7);
  const bounds = useMemo(() => monthBounds(selectedDate), [selectedDate]);
  const week = useMemo(() => weekBounds(selectedDate), [selectedDate]);
  // Load enough to cover the 7-day trend, the selected week (which can cross months) and the month.
  const queryStart = useMemo(() => {
    const trendStart = addDays(selectedDate, -6);
    return [trendStart, bounds.start, week.start].sort()[0];
  }, [bounds.start, selectedDate, week.start]);
  const queryEnd = bounds.end > week.end ? bounds.end : week.end;

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError('');
    const next: OperationsData = { stoneCrusher: [], sandWashing: [], quarrySite: [], wobbler: [] };
    const failures: string[] = [];

    await Promise.all([
      access.stoneCrusher ? (async () => {
        const result = await fetchAllPages(async (from, to) => supabase.from('stone_crusher_daily_entries').select('*')
          .gte('entry_date', queryStart).lte('entry_date', queryEnd).order('entry_date').order('id').range(from, to));
        if (result.error) failures.push('Stone Crusher');
        else next.stoneCrusher = result.data ?? [];
      })() : Promise.resolve(),
      access.sandWashing ? (async () => {
        const result = await fetchAllPages(async (from, to) => supabase.from('sand_washing_daily_entries').select('*')
          .gte('entry_date', queryStart).lte('entry_date', queryEnd).order('entry_date').order('id').range(from, to));
        if (result.error) failures.push('Sand Washing');
        else next.sandWashing = result.data ?? [];
      })() : Promise.resolve(),
      access.quarrySite ? (async () => {
        const result = await fetchAllPages(async (from, to) => supabase.from('quarry_site_daily_entries').select('*')
          .gte('entry_date', queryStart).lte('entry_date', queryEnd).order('entry_date').order('id').range(from, to));
        if (result.error) failures.push('Quarry Site');
        else next.quarrySite = result.data ?? [];
      })() : Promise.resolve(),
      access.wobbler ? (async () => {
        const result = await fetchAllPages(async (from, to) => supabase.from('wobbler_daily_entries').select('*')
          .gte('entry_date', queryStart).lte('entry_date', queryEnd).order('entry_date').order('id').range(from, to));
        if (result.error) failures.push('Wobbler');
        else next.wobbler = result.data ?? [];
      })() : Promise.resolve(),
    ]);

    setData(next);
    if (failures.length > 0) setError(`Could not load: ${failures.join(', ')}. Please refresh and try again.`);
    setLoading(false);
  }, [access, queryEnd, queryStart]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const currentDay = useMemo(
    () => buildOperationsDaySummary(selectedDate, data, access),
    [access, data, selectedDate],
  );
  const trendDates = useMemo(() => datesBetween(addDays(selectedDate, -6), selectedDate), [selectedDate]);
  const trendRows = useMemo(
    () => buildOperationsDaySummaries(trendDates, data, access),
    [access, data, trendDates],
  );
  const monthDates = useMemo(() => {
    const today = todayInput();
    const end = selectedMonth === today.slice(0, 7) ? today : bounds.end;
    return datesBetween(bounds.start, end);
  }, [bounds.end, bounds.start, selectedMonth]);
  const monthRows = useMemo(
    () => buildOperationsDaySummaries(monthDates, data, access),
    [access, data, monthDates],
  );
  const weekDates = useMemo(() => {
    const today = todayInput();
    // Future days of the current week are not shown yet.
    return datesBetween(week.start, week.end < today ? week.end : today > week.start ? today : week.start);
  }, [week.end, week.start]);
  const weekRows = useMemo(
    () => buildOperationsDaySummaries(weekDates, data, access),
    [access, data, weekDates],
  );
  const visibleRows = viewMode === 'day' ? trendRows : viewMode === 'week' ? weekRows : monthRows;
  const periodRows = viewMode === 'day' ? [currentDay] : viewMode === 'week' ? weekRows : monthRows;
  const periodLabel = viewMode === 'day'
    ? formatDate(selectedDate)
    : viewMode === 'week'
      ? formatWeekLabel(week.start, week.end)
      : formatDate(`${selectedMonth}-01`, { month: 'long', year: 'numeric' });
  const periodSubmitted = periodRows.reduce((sum, row) => sum + row.submittedCount, 0);
  const periodExpected = periodRows.reduce((sum, row) => sum + row.expectedCount, 0);
  const periodDiesel = periodRows.reduce((sum, row) => sum + row.totalDieselLiters, 0);
  const periodScVolume = periodRows.reduce((sum, row) => sum + (row.stoneCrusher.entry?.total_volume_cbm ?? 0), 0);
  const periodSwOutput = periodRows.reduce(
    (sum, row) => sum + (row.sandWashing.entry?.vibro_sand_volume_cbm ?? 0) + (row.sandWashing.entry?.waste_volume_cbm ?? 0),
    0,
  );

  const scEntries = periodRows.flatMap(row => row.stoneCrusher.entry ? [row.stoneCrusher.entry] : []);
  const swEntries = periodRows.flatMap(row => row.sandWashing.entry ? [row.sandWashing.entry] : []);
  const qsEntries = periodRows.flatMap(row => row.quarrySite.entry ? [row.quarrySite.entry] : []);
  const wbEntries = periodRows.flatMap(row => row.wobbler.entry ? [row.wobbler.entry] : []);
  const chartData = useMemo<ChartDatum[]>(() => visibleRows.map(row => ({
    date: row.date,
    diesel: row.totalDieselLiters,
    scProduction: row.stoneCrusher.entry?.total_volume_cbm ?? 0,
    swProduction: (row.sandWashing.entry?.vibro_sand_volume_cbm ?? 0) + (row.sandWashing.entry?.waste_volume_cbm ?? 0),
    operationHours: row.totalOperationMinutes / 60,
    downtimeHours: row.totalDowntimeMinutes / 60,
  })), [visibleRows]);

  function handleMonthChange(value: string) {
    if (!value) return;
    setSelectedDate(`${value}-01`);
  }

  function handleExport() {
    const rows: Array<Array<string | number>> = [[
      'Date', 'Submitted', 'Expected', 'Completion %', 'Total Diesel (L)',
      ...(access.stoneCrusher ? ['SC Status', 'SC Operation Hours', 'SC Downtime Hours', 'SC G1 (cbm)', 'SC 3/4 (cbm)', 'SC S-3/4 (cbm)', 'SC S1.C (cbm)', 'SC Total Volume (cbm)'] : []),
      ...(access.sandWashing ? ['SW Status', 'SW Operation Hours', 'SW Vibro (cbm)', 'SW Waste (cbm)', 'SW Diesel (L)'] : []),
      ...(access.quarrySite ? ['QS Status', 'QS Binder Trips', 'QS Boulder Trips', 'QS Diesel (L)', 'QS Amount'] : []),
      ...(access.wobbler ? ['Wobbler Status', 'Wobbler Operation Hours', 'Wobbler Downtime Hours', 'Wobbler Dumps', 'Wobbler Diesel (L)'] : []),
    ]];

    for (const row of periodRows) {
      rows.push([
        row.date, row.submittedCount, row.expectedCount, row.completenessPercent, row.totalDieselLiters,
        ...(access.stoneCrusher ? [
          row.stoneCrusher.status,
          (row.stoneCrusher.entry?.operation_minutes ?? 0) / 60,
          (row.stoneCrusher.entry?.downtime_minutes ?? 0) / 60,
          row.stoneCrusher.entry?.g1_volume_cbm ?? 0,
          row.stoneCrusher.entry?.three_fourth_volume_cbm ?? 0,
          row.stoneCrusher.entry?.s_three_fourth_volume_cbm ?? 0,
          row.stoneCrusher.entry?.s1c_volume_cbm ?? 0,
          row.stoneCrusher.entry?.total_volume_cbm ?? 0,
        ] : []),
        ...(access.sandWashing ? [
          row.sandWashing.status,
          (row.sandWashing.entry?.operation_minutes ?? 0) / 60,
          row.sandWashing.entry?.vibro_sand_volume_cbm ?? 0,
          row.sandWashing.entry?.waste_volume_cbm ?? 0,
          row.sandWashing.entry?.genset_diesel_consumption_liters ?? 0,
        ] : []),
        ...(access.quarrySite ? [
          row.quarrySite.status,
          row.quarrySite.entry?.jafcor_binder_trips ?? 0,
          row.quarrySite.entry?.jafcor_boulder_trips ?? 0,
          row.quarrySite.entry?.total_diesel_consumption_liters ?? 0,
          row.quarrySite.entry?.total_computed_amount ?? 0,
        ] : []),
        ...(access.wobbler ? [
          row.wobbler.status,
          (row.wobbler.entry?.operation_minutes ?? 0) / 60,
          (row.wobbler.entry?.downtime_minutes ?? 0) / 60,
          row.wobbler.entry?.number_of_dumps ?? 0,
          row.wobbler.entry?.genset_diesel_consumption_liters ?? 0,
        ] : []),
      ]);
    }

    downloadCsv(`daily-operations-${viewMode === 'day' ? selectedDate : viewMode === 'week' ? `week-${week.start}` : selectedMonth}.csv`, rows);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-600">Daily Operations</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Operations Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Consolidated production, diesel, downtime, and daily submission status.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
            {(['day', 'week', 'month'] as ViewMode[]).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                  viewMode === mode ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {mode === 'day' ? 'Today / Date' : mode === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>
          {viewMode === 'week' && (
            <div className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white">
              <button type="button" onClick={() => setSelectedDate(addDays(week.start, -7))} aria-label="Previous week" title="Previous week" className="flex h-full w-8 items-center justify-center rounded-l-lg text-slate-500 hover:bg-slate-50">
                <ChevronLeft size={16} />
              </button>
              <span className="whitespace-nowrap px-2 text-xs font-semibold text-slate-700">{formatWeekLabel(week.start, week.end)}</span>
              <button type="button" onClick={() => setSelectedDate(addDays(week.start, 7))} disabled={addDays(week.start, 7) > todayInput()} aria-label="Next week" title="Next week" className="flex h-full w-8 items-center justify-center rounded-r-lg text-slate-500 hover:bg-slate-50 disabled:opacity-40">
                <ChevronRight size={16} />
              </button>
            </div>
          )}
          <label className="relative" title={viewMode === 'week' ? 'Pick any date to jump to its week' : undefined}>
            <CalendarDays size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type={viewMode === 'month' ? 'month' : 'date'}
              value={viewMode === 'month' ? selectedMonth : selectedDate}
              onChange={event => {
                if (!event.target.value) return;
                if (viewMode !== 'month') setSelectedDate(event.target.value);
                else handleMonthChange(event.target.value);
              }}
              className="h-9 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download size={15} /> Export
          </button>
          <button
            type="button"
            onClick={() => void loadEntries()}
            disabled={loading}
            aria-label="Refresh dashboard"
            title="Refresh dashboard"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Records Submitted"
          value={`${periodSubmitted} / ${periodExpected}`}
          detail={viewMode === 'day' ? formatDate(selectedDate) : `${formatNumber(periodExpected > 0 ? (periodSubmitted / periodExpected) * 100 : 0, 0)}% period completion`}
          icon={<ClipboardCheck size={19} />}
          tone="bg-emerald-50 text-emerald-600"
        />
        <KpiCard
          label="Operations Diesel"
          value={`${formatNumber(periodDiesel)} L`}
          detail="Recorded across accessible modules"
          icon={<Fuel size={19} />}
          tone="bg-amber-50 text-amber-600"
        />
        <KpiCard
          label="SC Product Volume"
          value={access.stoneCrusher ? `${formatNumber(periodScVolume)} cbm` : 'No access'}
          detail="Total measured stockpile volume"
          icon={<Factory size={19} />}
          tone="bg-sky-50 text-sky-600"
        />
        <KpiCard
          label="SW Output Volume"
          value={access.sandWashing ? `${formatNumber(periodSwOutput)} cbm` : 'No access'}
          detail="Vibro sand plus waste volume"
          icon={<Waves size={19} />}
          tone="bg-violet-50 text-violet-600"
        />
      </div>

      {loading ? (
        <div className="flex min-h-64 items-center justify-center border-y border-slate-200 bg-white">
          <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" /> Loading operations data...</div>
        </div>
      ) : (
        <>
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Module Summary</h2>
                <p className="text-xs text-slate-500">{periodLabel}</p>
              </div>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {access.stoneCrusher && (
                <ModulePanel
                  title="Stone Crusher"
                  icon={<Factory size={17} />}
                  status={viewMode === 'day' ? currentDay.stoneCrusher.status : undefined}
                  onOpen={moduleNavigation.stoneCrusher ? () => onNavigate('operations-stone-crusher') : undefined}
                  footerAction={viewMode === 'day' && !currentDay.stoneCrusher.entry && canMarkNoOperation?.stoneCrusher ? (
                    <NoOperationButton module="stoneCrusher" date={selectedDate} compact onError={setError} onDone={loadEntries} />
                  ) : undefined}
                  metrics={[
                    { label: 'Entries', value: String(scEntries.length) },
                    { label: 'Operation', value: formatHours(scEntries.reduce((sum, entry) => sum + entry.operation_minutes, 0)) },
                    { label: 'Downtime', value: formatHours(scEntries.reduce((sum, entry) => sum + entry.downtime_minutes, 0)) },
                    { label: 'G1', value: `${formatNumber(scEntries.reduce((sum, entry) => sum + entry.g1_volume_cbm, 0))} cbm` },
                    { label: '3/4', value: `${formatNumber(scEntries.reduce((sum, entry) => sum + entry.three_fourth_volume_cbm, 0))} cbm` },
                    { label: 'S-3/4', value: `${formatNumber(scEntries.reduce((sum, entry) => sum + entry.s_three_fourth_volume_cbm, 0))} cbm` },
                    { label: 'S1.C', value: `${formatNumber(scEntries.reduce((sum, entry) => sum + entry.s1c_volume_cbm, 0))} cbm` },
                    { label: 'Capacity', value: viewMode === 'day' && scEntries[0] ? `${formatNumber(scEntries[0].plant_capacity_cbm_per_hour)} cbm/hr` : `${formatNumber(rateFor(scEntries.reduce((sum, entry) => sum + entry.total_volume_cbm, 0), scEntries.reduce((sum, entry) => sum + entry.operation_minutes, 0)))} cbm/hr` },
                    { label: 'Diesel', value: `${formatNumber(scEntries.reduce((sum, entry) => sum + entry.genset_diesel_consumption, 0))} L` },
                  ]}
                />
              )}
              {access.sandWashing && (
                <ModulePanel
                  title="Sand Washing"
                  icon={<Waves size={17} />}
                  status={viewMode === 'day' ? currentDay.sandWashing.status : undefined}
                  onOpen={moduleNavigation.sandWashing ? () => onNavigate('operations-sand-washing') : undefined}
                  footerAction={viewMode === 'day' && !currentDay.sandWashing.entry && canMarkNoOperation?.sandWashing ? (
                    <NoOperationButton module="sandWashing" date={selectedDate} compact onError={setError} onDone={loadEntries} />
                  ) : undefined}
                  metrics={[
                    { label: 'Entries', value: String(swEntries.length) },
                    { label: 'Operation', value: formatHours(swEntries.reduce((sum, entry) => sum + entry.operation_minutes, 0)) },
                    { label: 'Dumps', value: formatNumber(swEntries.reduce((sum, entry) => sum + entry.number_of_dumps, 0), 0) },
                    { label: 'Vibro Sand', value: `${formatNumber(swEntries.reduce((sum, entry) => sum + entry.vibro_sand_volume_cbm, 0))} cbm` },
                    { label: 'Waste', value: `${formatNumber(swEntries.reduce((sum, entry) => sum + entry.waste_volume_cbm, 0))} cbm` },
                    { label: 'Waste Product', value: viewMode === 'day' ? (swEntries[0]?.waste_product ?? 'No entry') : `${new Set(swEntries.map(entry => entry.waste_product)).size} type(s)` },
                    { label: 'Diesel', value: `${formatNumber(swEntries.reduce((sum, entry) => sum + entry.genset_diesel_consumption_liters, 0))} L` },
                    { label: 'Diesel Rate', value: `${formatNumber(rateFor(swEntries.reduce((sum, entry) => sum + entry.genset_diesel_consumption_liters, 0), swEntries.reduce((sum, entry) => sum + entry.operation_minutes, 0)))} L/hr` },
                    { label: 'Waste Trucks', value: formatNumber(swEntries.reduce((sum, entry) => sum + entry.number_truck_waste, 0), 0) },
                  ]}
                />
              )}
              {access.quarrySite && (
                <ModulePanel
                  title="Quarry Site"
                  icon={<Mountain size={17} />}
                  status={viewMode === 'day' ? currentDay.quarrySite.status : undefined}
                  onOpen={moduleNavigation.quarrySite ? () => onNavigate('operations-quarry-site') : undefined}
                  footerAction={viewMode === 'day' && !currentDay.quarrySite.entry && canMarkNoOperation?.quarrySite ? (
                    <NoOperationButton module="quarrySite" date={selectedDate} compact onError={setError} onDone={loadEntries} />
                  ) : undefined}
                  metrics={[
                    { label: 'Entries', value: String(qsEntries.length) },
                    { label: 'Binder Trips', value: formatNumber(qsEntries.reduce((sum, entry) => sum + entry.jafcor_binder_trips, 0), 0) },
                    { label: 'Boulder Trips', value: formatNumber(qsEntries.reduce((sum, entry) => sum + entry.jafcor_boulder_trips, 0), 0) },
                    { label: 'Truck Entries', value: viewMode === 'day' ? (qsEntries[0]?.number_of_trucks || 'None') : `${qsEntries.filter(entry => entry.number_of_trucks).length} recorded` },
                    { label: 'Equipment', value: formatNumber(qsEntries.reduce((sum, entry) => sum + entry.number_of_equipment, 0), 0) },
                    { label: 'Quarry Diesel', value: `${formatNumber(qsEntries.reduce((sum, entry) => sum + entry.quarry_equipment_diesel_liters, 0))} L` },
                    { label: 'Total Diesel', value: `${formatNumber(qsEntries.reduce((sum, entry) => sum + entry.total_diesel_consumption_liters, 0))} L` },
                    { label: 'Computed Amount', value: `PHP ${formatNumber(qsEntries.reduce((sum, entry) => sum + entry.total_computed_amount, 0))}` },
                    { label: 'Total Trips', value: formatNumber(qsEntries.reduce((sum, entry) => sum + entry.total_boulder_trips + entry.jafcor_binder_trips, 0), 0) },
                  ]}
                />
              )}
              {access.wobbler && (
                <ModulePanel
                  title="Wobbler"
                  icon={<Cog size={17} />}
                  status={viewMode === 'day' ? currentDay.wobbler.status : undefined}
                  onOpen={moduleNavigation.wobbler ? () => onNavigate('operations-wobbler') : undefined}
                  footerAction={viewMode === 'day' && !currentDay.wobbler.entry && canMarkNoOperation?.wobbler ? (
                    <NoOperationButton module="wobbler" date={selectedDate} compact onError={setError} onDone={loadEntries} />
                  ) : undefined}
                  metrics={[
                    { label: 'Entries', value: String(wbEntries.length) },
                    { label: 'Operation', value: formatHours(wbEntries.reduce((sum, entry) => sum + entry.operation_minutes, 0)) },
                    { label: 'Downtime', value: formatHours(wbEntries.reduce((sum, entry) => sum + entry.downtime_minutes, 0)) },
                    { label: 'Dumps', value: formatNumber(wbEntries.reduce((sum, entry) => sum + entry.number_of_dumps, 0), 0) },
                    { label: 'Loaders', value: formatNumber(wbEntries.reduce((sum, entry) => sum + entry.number_of_loaders, 0), 0) },
                    { label: 'Dumps / Hour', value: `${formatNumber(rateFor(wbEntries.reduce((sum, entry) => sum + entry.number_of_dumps, 0), wbEntries.reduce((sum, entry) => sum + entry.operation_minutes, 0)))} /hr` },
                    { label: 'Diesel', value: `${formatNumber(wbEntries.reduce((sum, entry) => sum + entry.genset_diesel_consumption_liters, 0))} L` },
                    { label: 'Diesel Rate', value: `${formatNumber(rateFor(wbEntries.reduce((sum, entry) => sum + entry.genset_diesel_consumption_liters, 0), wbEntries.reduce((sum, entry) => sum + entry.operation_minutes, 0)))} L/hr` },
                    { label: 'Tracked Time', value: formatHours(wbEntries.reduce((sum, entry) => sum + entry.operation_minutes + entry.downtime_minutes, 0)) },
                  ]}
                />
              )}
            </div>
          </section>

          <section>
            <div className="mb-3">
              <h2 className="text-base font-bold text-slate-900">Operations Trends</h2>
              <p className="text-xs text-slate-500">{viewMode === 'day' ? 'Latest seven days through the selected date' : viewMode === 'week' ? 'Daily movement across the selected week' : 'Daily movement across the selected month'}</p>
            </div>
            <div className="grid gap-4 xl:grid-cols-3">
              <ChartShell
                title="Diesel Consumption"
                subtitle="Combined operations diesel"
                legend={[{ label: 'Diesel', color: '#d97706' }]}
              >
                <DieselLineChart data={chartData} />
              </ChartShell>
              <ChartShell
                title="Production Volume"
                subtitle="Stone Crusher and Sand Washing output"
                legend={[
                  { label: 'Stone Crusher', color: '#0284c7' },
                  { label: 'Sand Washing', color: '#7c3aed' },
                ]}
              >
                <ProductionBarChart data={chartData} />
              </ChartShell>
              <ChartShell
                title="Tracked Hours"
                subtitle="Combined operation and downtime"
                legend={[
                  { label: 'Operation', color: '#10b981' },
                  { label: 'Downtime', color: '#f59e0b' },
                ]}
              >
                <HoursBarChart data={chartData} />
              </ChartShell>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.42fr)]">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Consolidated Daily Log</h2>
                  <p className="text-xs text-slate-500">{viewMode === 'day' ? 'Latest seven days' : viewMode === 'week' ? 'Daily records for the selected week' : 'Daily records for the selected month'}</p>
                </div>
                <Truck size={17} className="text-slate-400" />
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">Date</th>
                      <th className="whitespace-nowrap px-3 py-3 font-semibold">Submitted</th>
                      {access.stoneCrusher && <th className="whitespace-nowrap px-3 py-3 font-semibold">Stone Crusher</th>}
                      {access.sandWashing && <th className="whitespace-nowrap px-3 py-3 font-semibold">Sand Washing</th>}
                      {access.quarrySite && <th className="whitespace-nowrap px-3 py-3 font-semibold">Quarry Site</th>}
                      {access.wobbler && <th className="whitespace-nowrap px-3 py-3 font-semibold">Wobbler</th>}
                      <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">Diesel</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">Downtime</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...visibleRows].reverse().map(row => (
                      <tr key={row.date} className="hover:bg-slate-50/70">
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-800">{formatDate(row.date, { month: 'short', day: 'numeric' })}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{row.submittedCount} / {row.expectedCount}</td>
                        {access.stoneCrusher && <td className="whitespace-nowrap px-3 py-3"><span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${statusBadgeClass(row.stoneCrusher.status)}`}>{row.stoneCrusher.status}</span></td>}
                        {access.sandWashing && <td className="whitespace-nowrap px-3 py-3"><span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${statusBadgeClass(row.sandWashing.status)}`}>{row.sandWashing.status}</span></td>}
                        {access.quarrySite && <td className="whitespace-nowrap px-3 py-3"><span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${statusBadgeClass(row.quarrySite.status)}`}>{row.quarrySite.status}</span></td>}
                        {access.wobbler && <td className="whitespace-nowrap px-3 py-3"><span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${statusBadgeClass(row.wobbler.status)}`}>{row.wobbler.status}</span></td>}
                        <td className="whitespace-nowrap px-3 py-3 text-right font-medium text-slate-700">{formatNumber(row.totalDieselLiters)} L</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-slate-700">{formatHours(row.totalDowntimeMinutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Gauge size={17} className="text-slate-400" />
                  <h2 className="text-sm font-bold text-slate-900">7-Day Completeness</h2>
                </div>
                <p className="mt-1 text-xs text-slate-500">Saved entry coverage for accessible modules.</p>
              </div>
              <div className="px-4 py-4">
                <CompletenessBars rows={trendRows} />
                <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                  <div>
                    <p className="text-[10px] font-medium uppercase text-slate-500">7-Day Diesel</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{formatNumber(trendRows.reduce((sum, row) => sum + row.totalDieselLiters, 0))} L</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase text-slate-500">7-Day Downtime</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{formatHours(trendRows.reduce((sum, row) => sum + row.totalDowntimeMinutes, 0))}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
