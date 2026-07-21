import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ClipboardList,
  Database,
  Download,
  FileText,
  Fuel,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Truck,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { FuelBranch, FuelInventoryLedger, FuelInventoryState, FuelIssuance, FuelPurchase, Truck as TruckType } from '../lib/database.types';
import Pagination from './Pagination';
import { paginate } from '../lib/pagination';
import ReadOnlyNotice from './ReadOnlyNotice';

const PAGE_SIZE = 8;
const chartColors = ['#10b981', '#38bdf8', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b'];
const issueCategories = ['Hauler Offset', 'Company Equipment', 'Company Truck', 'Parts / Errand', 'Owner / Personal'];

type FuelTab = 'overview' | 'purchases' | 'issuances' | 'history';
type FuelIssuanceWithTruck = FuelIssuance & { trucks?: TruckType | null };

interface FuelManagementProps {
  canAddPurchase?: boolean;
  canIssue?: boolean;
  canAdjust?: boolean;
  canExport?: boolean;
}

function todayInput() {
  return new Date().toISOString().split('T')[0];
}

function monthStartInput() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), '01'].join('-');
}

function fmt(v: number) {
  return v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function currency(v: number) {
  return `₱${fmt(v)}`;
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

function htmlEscape(value: string | number) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function movementBadge(type: FuelInventoryLedger['movement_type']) {
  const map: Record<FuelInventoryLedger['movement_type'], string> = {
    OPENING_BALANCE: 'bg-sky-50 text-sky-700 border-sky-200',
    PURCHASE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    ISSUANCE: 'bg-orange-50 text-orange-700 border-orange-200',
    ADJUSTMENT: 'bg-violet-50 text-violet-700 border-violet-200',
    REVERSAL: 'bg-rose-50 text-rose-700 border-rose-200',
  };
  return map[type];
}

function DonutChart({ data }: { data: { label: string; value: number }[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const gradient = total > 0
    ? data.map((item, index) => {
        const start = cursor;
        const end = cursor + (item.value / total) * 100;
        cursor = end;
        return `${chartColors[index % chartColors.length]} ${start}% ${end}%`;
      }).join(', ')
    : '#e2e8f0 0% 100%';

  return (
    <div className="flex items-center gap-5 flex-wrap">
      <div className="relative w-36 h-36 rounded-full shrink-0" style={{ background: `conic-gradient(${gradient})` }}>
        <div className="absolute inset-8 rounded-full bg-white flex items-center justify-center text-center">
          <div>
            <p className="text-lg font-bold text-slate-800 tabular-nums">{fmt(total)}</p>
            <p className="text-xs text-slate-500">liters</p>
          </div>
        </div>
      </div>
      <div className="space-y-2 min-w-48 flex-1">
        {data.length === 0 ? (
          <p className="text-sm text-slate-500">No issuances this month</p>
        ) : data.map((item, index) => (
          <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: chartColors[index % chartColors.length] }} />
              <span className="text-slate-600 truncate">{item.label}</span>
            </span>
            <span className="font-semibold text-slate-800 tabular-nums">{fmt(item.value)} L</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FuelManagement({
  canAddPurchase = false,
  canIssue = false,
  canAdjust = false,
  canExport = false,
}: FuelManagementProps) {
  const [activeTab, setActiveTab] = useState<FuelTab>('overview');
  const [branches, setBranches] = useState<FuelBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('ALL');
  const [states, setStates] = useState<FuelInventoryState[]>([]);
  const [purchases, setPurchases] = useState<FuelPurchase[]>([]);
  const [issuances, setIssuances] = useState<FuelIssuanceWithTruck[]>([]);
  const [ledger, setLedger] = useState<FuelInventoryLedger[]>([]);
  const [haulerTrucks, setHaulerTrucks] = useState<TruckType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [purchasePage, setPurchasePage] = useState(1);
  const [issuancePage, setIssuancePage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);

  const [purchaseForm, setPurchaseForm] = useState({
    purchase_date: todayInput(),
    supplier: '',
    reference_no: '',
    liters: '',
    unit_cost: '',
    remarks: '',
  });
  const [issuanceForm, setIssuanceForm] = useState({
    issuance_date: todayInput(),
    category: issueCategories[0],
    issued_to: '',
    truck_id: '',
    reference_no: '',
    liters: '',
    remarks: '',
  });
  const [adjustmentForm, setAdjustmentForm] = useState({
    movement_date: todayInput(),
    liters_delta: '',
    unit_cost: '',
    reference_no: '',
    description: '',
    is_opening_balance: false,
  });

  const selectedBranch = selectedBranchId === 'ALL' ? null : branches.find(branch => branch.id === selectedBranchId) ?? null;
  const defaultBranch = branches.find(branch => branch.is_default) ?? branches[0] ?? null;
  const actionBranchId = selectedBranch?.id ?? defaultBranch?.id ?? '';
  const monthStart = useMemo(() => monthStartInput(), []);

  const fetchFuelData = useCallback(async () => {
    setLoading(true);
    setError('');

    const branchQuery = supabase
      .from('fuel_branches')
      .select('*')
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('name');

    const stateQuery = supabase.from('fuel_inventory_state').select('*');

    let purchaseQuery = supabase
      .from('fuel_purchases')
      .select('*')
      .order('purchase_date', { ascending: false })
      .order('created_at', { ascending: false });

    let issuanceQuery = supabase
      .from('fuel_issuances')
      .select('*, trucks(*)')
      .order('issuance_date', { ascending: false })
      .order('created_at', { ascending: false });

    let ledgerQuery = supabase
      .from('fuel_inventory_ledger')
      .select('*')
      .order('movement_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (selectedBranchId !== 'ALL') {
      purchaseQuery = purchaseQuery.eq('branch_id', selectedBranchId);
      issuanceQuery = issuanceQuery.eq('branch_id', selectedBranchId);
      ledgerQuery = ledgerQuery.eq('branch_id', selectedBranchId);
    }

    const truckQuery = supabase
      .from('trucks')
      .select('*')
      .eq('is_hauler', true)
      .order('plate_number');

    const [branchResult, stateResult, purchaseResult, issuanceResult, ledgerResult, truckResult] = await Promise.all([
      branchQuery,
      stateQuery,
      purchaseQuery,
      issuanceQuery,
      ledgerQuery,
      truckQuery,
    ]);

    const firstError = branchResult.error || stateResult.error || purchaseResult.error || issuanceResult.error || ledgerResult.error || truckResult.error;
    if (firstError) setError(firstError.message);

    setBranches((branchResult.data ?? []) as FuelBranch[]);
    setStates((stateResult.data ?? []) as FuelInventoryState[]);
    setPurchases((purchaseResult.data ?? []) as FuelPurchase[]);
    setIssuances((issuanceResult.data ?? []) as FuelIssuanceWithTruck[]);
    setLedger((ledgerResult.data ?? []) as FuelInventoryLedger[]);
    setHaulerTrucks((truckResult.data ?? []) as TruckType[]);
    setLoading(false);
  }, [selectedBranchId]);

  useEffect(() => {
    fetchFuelData();
  }, [fetchFuelData]);

  useEffect(() => {
    setPurchasePage(1);
    setIssuancePage(1);
    setHistoryPage(1);
  }, [search, selectedBranchId, activeTab]);

  const filteredPurchases = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return purchases;
    return purchases.filter(item =>
      item.supplier.toLowerCase().includes(q) ||
      item.reference_no.toLowerCase().includes(q) ||
      item.remarks.toLowerCase().includes(q)
    );
  }, [purchases, search]);

  const filteredIssuances = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return issuances;
    return issuances.filter(item =>
      item.category.toLowerCase().includes(q) ||
      item.issued_to.toLowerCase().includes(q) ||
      item.reference_no.toLowerCase().includes(q) ||
      (item.trucks?.plate_number ?? '').toLowerCase().includes(q)
    );
  }, [issuances, search]);

  const filteredLedger = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ledger;
    return ledger.filter(item =>
      item.movement_type.toLowerCase().includes(q) ||
      item.reference_no.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q)
    );
  }, [ledger, search]);

  const summary = useMemo(() => {
    const scopedStates = selectedBranchId === 'ALL'
      ? states
      : states.filter(state => state.branch_id === selectedBranchId);
    const currentLiters = scopedStates.reduce((sum, state) => sum + (state.current_liters ?? 0), 0);
    const inventoryValue = scopedStates.reduce((sum, state) => sum + (state.inventory_value ?? 0), 0);
    const averageCost = currentLiters > 0 ? inventoryValue / currentLiters : 0;
    const purchasedThisMonth = purchases
      .filter(item => item.purchase_date >= monthStart)
      .reduce((sum, item) => sum + (item.liters ?? 0), 0);
    const purchaseCostThisMonth = purchases
      .filter(item => item.purchase_date >= monthStart)
      .reduce((sum, item) => sum + (item.total_amount ?? 0), 0);
    const issuedThisMonth = issuances
      .filter(item => item.issuance_date >= monthStart)
      .reduce((sum, item) => sum + (item.liters ?? 0), 0);
    const issuedValueThisMonth = issuances
      .filter(item => item.issuance_date >= monthStart)
      .reduce((sum, item) => sum + (item.total_value ?? 0), 0);

    return {
      currentLiters,
      inventoryValue,
      averageCost,
      purchasedThisMonth,
      purchaseCostThisMonth,
      issuedThisMonth,
      issuedValueThisMonth,
    };
  }, [issuances, monthStart, purchases, selectedBranchId, states]);

  const categoryChartData = useMemo(() => {
    const map: Record<string, number> = {};
    issuances
      .filter(item => item.issuance_date >= monthStart)
      .forEach(item => {
        map[item.category] = (map[item.category] ?? 0) + item.liters;
      });
    return Object.entries(map)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [issuances, monthStart]);

  async function handlePurchaseSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!actionBranchId) return;
    setSaving(true);
    setError('');
    const { error: rpcError } = await supabase.rpc('create_fuel_purchase', {
      p_branch_id: actionBranchId,
      p_purchase_date: purchaseForm.purchase_date,
      p_supplier: purchaseForm.supplier.trim(),
      p_reference_no: purchaseForm.reference_no.trim(),
      p_liters: Number(purchaseForm.liters),
      p_unit_cost: Number(purchaseForm.unit_cost),
      p_remarks: purchaseForm.remarks.trim(),
    });
    setSaving(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setPurchaseForm({ purchase_date: todayInput(), supplier: '', reference_no: '', liters: '', unit_cost: '', remarks: '' });
    await fetchFuelData();
  }

  async function handleIssuanceSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!actionBranchId) return;
    if (issuanceForm.category === 'Hauler Offset' && !issuanceForm.truck_id) {
      setError('Select a hauler truck before saving a Hauler Offset fuel issuance.');
      return;
    }
    setSaving(true);
    setError('');
    const { error: rpcError } = await supabase.rpc('create_fuel_issuance', {
      p_branch_id: actionBranchId,
      p_issuance_date: issuanceForm.issuance_date,
      p_category: issuanceForm.category,
      p_issued_to: issuanceForm.issued_to.trim(),
      p_truck_id: issuanceForm.truck_id || null,
      p_reference_no: issuanceForm.reference_no.trim(),
      p_liters: Number(issuanceForm.liters),
      p_remarks: issuanceForm.remarks.trim(),
    });
    setSaving(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setIssuanceForm({ issuance_date: todayInput(), category: issueCategories[0], issued_to: '', truck_id: '', reference_no: '', liters: '', remarks: '' });
    await fetchFuelData();
  }

  async function handleAdjustmentSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!actionBranchId) return;
    setSaving(true);
    setError('');
    const { error: rpcError } = await supabase.rpc('create_fuel_adjustment', {
      p_branch_id: actionBranchId,
      p_movement_date: adjustmentForm.movement_date,
      p_liters_delta: Number(adjustmentForm.liters_delta),
      p_unit_cost: Number(adjustmentForm.unit_cost),
      p_reference_no: adjustmentForm.reference_no.trim(),
      p_description: adjustmentForm.description.trim(),
      p_is_opening_balance: adjustmentForm.is_opening_balance,
    });
    setSaving(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setAdjustmentForm({ movement_date: todayInput(), liters_delta: '', unit_cost: '', reference_no: '', description: '', is_opening_balance: false });
    await fetchFuelData();
  }

  async function reverseMovement(item: FuelInventoryLedger) {
    if (!confirm('Reverse this fuel movement?')) return;
    setSaving(true);
    setError('');
    const { error: rpcError } = await supabase.rpc('reverse_fuel_movement', {
      p_ledger_id: item.id,
      p_reason: `Reversal of ${item.movement_type}`,
    });
    setSaving(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    await fetchFuelData();
  }

  function handleTruckPick(truckId: string) {
    const truck = haulerTrucks.find(item => item.id === truckId);
    setIssuanceForm(form => ({
      ...form,
      truck_id: truckId,
      issued_to: truck ? `${truck.plate_number}${truck.driver_name ? ` - ${truck.driver_name}` : ''}` : form.issued_to,
    }));
  }

  function exportRows() {
    if (activeTab === 'purchases') {
      return {
        title: 'Fuel Purchases',
        filename: 'fuel-purchases',
        headers: ['Date', 'Supplier', 'Reference', 'Liters', 'Unit Cost', 'Total', 'Remarks'],
        rows: filteredPurchases.map(item => [item.purchase_date, item.supplier, item.reference_no, fmt(item.liters), fmt(item.unit_cost), fmt(item.total_amount), item.remarks]),
      };
    }
    if (activeTab === 'issuances') {
      return {
        title: 'Fuel Issuances',
        filename: 'fuel-issuances',
        headers: ['Date', 'Category', 'Issued To', 'Truck', 'Reference', 'Liters', 'Unit Cost', 'Total Value', 'Remarks'],
        rows: filteredIssuances.map(item => [item.issuance_date, item.category, item.issued_to, item.trucks?.plate_number ?? '', item.reference_no, fmt(item.liters), fmt(item.unit_cost_snapshot), fmt(item.total_value), item.remarks]),
      };
    }
    return {
      title: 'Fuel Inventory History',
      filename: 'fuel-inventory-history',
      headers: ['Date', 'Type', 'Reference', 'Description', 'Liters Delta', 'Unit Cost', 'Value Delta', 'Balance Liters', 'Average Cost'],
      rows: filteredLedger.map(item => [item.movement_date, item.movement_type, item.reference_no, item.description, fmt(item.liters_delta), fmt(item.unit_cost), fmt(item.value_delta), fmt(item.balance_liters_after), fmt(item.weighted_average_cost_after)]),
    };
  }

  function exportCsv() {
    const report = exportRows();
    const lines = [
      [report.title],
      [`Branch: ${selectedBranch?.name ?? 'All branches'}`],
      [`Generated: ${new Date().toLocaleString('en-PH')}`],
      [],
      report.headers,
      ...report.rows,
    ];
    const csv = `\uFEFF${lines.map(row => row.map(cell => csvEscape(cell)).join(',')).join('\r\n')}`;
    downloadTextFile(`${report.filename}-${todayInput()}.csv`, csv, 'text/csv;charset=utf-8');
  }

  function exportPdf() {
    const report = exportRows();
    const rowsHtml = report.rows.map(row => `<tr>${row.map(cell => `<td>${htmlEscape(cell)}</td>`).join('')}</tr>`).join('');
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow pop-ups to export the report PDF.');
      return;
    }

    printWindow.document.write(`<!doctype html>
      <html>
        <head>
          <title>${htmlEscape(report.title)}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #0f172a; margin: 32px; }
            h1 { font-size: 22px; margin: 0 0 8px; }
            .meta { color: #475569; font-size: 12px; margin-bottom: 18px; line-height: 1.55; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th { text-align: left; background: #f1f5f9; color: #475569; text-transform: uppercase; }
            th, td { border: 1px solid #e2e8f0; padding: 7px 8px; }
            td:nth-child(n+4), th:nth-child(n+4) { text-align: right; }
            @media print { body { margin: 18mm; } }
          </style>
        </head>
        <body>
          <h1>${htmlEscape(report.title)}</h1>
          <div class="meta">
            <div>Branch: ${htmlEscape(selectedBranch?.name ?? 'All branches')}</div>
            <div>Generated: ${htmlEscape(new Date().toLocaleString('en-PH'))}</div>
          </div>
          <table>
            <thead><tr>${report.headers.map(header => `<th>${htmlEscape(header)}</th>`).join('')}</tr></thead>
            <tbody>${rowsHtml || `<tr><td colspan="${report.headers.length}">No records found.</td></tr>`}</tbody>
          </table>
        </body>
      </html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  const pagedPurchases = useMemo(() => paginate(filteredPurchases, Math.min(purchasePage, Math.max(1, Math.ceil(filteredPurchases.length / PAGE_SIZE))), PAGE_SIZE), [filteredPurchases, purchasePage]);
  const pagedIssuances = useMemo(() => paginate(filteredIssuances, Math.min(issuancePage, Math.max(1, Math.ceil(filteredIssuances.length / PAGE_SIZE))), PAGE_SIZE), [filteredIssuances, issuancePage]);
  const pagedLedger = useMemo(() => paginate(filteredLedger, Math.min(historyPage, Math.max(1, Math.ceil(filteredLedger.length / PAGE_SIZE))), PAGE_SIZE), [filteredLedger, historyPage]);
  const purchaseCurrentPage = Math.min(purchasePage, Math.max(1, Math.ceil(filteredPurchases.length / PAGE_SIZE)));
  const issuanceCurrentPage = Math.min(issuancePage, Math.max(1, Math.ceil(filteredIssuances.length / PAGE_SIZE)));
  const historyCurrentPage = Math.min(historyPage, Math.max(1, Math.ceil(filteredLedger.length / PAGE_SIZE)));

  const tabs: { id: FuelTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'purchases', label: 'Fuel Purchases' },
    { id: 'issuances', label: 'Fuel Issuances' },
    { id: 'history', label: 'Inventory History' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <Fuel size={22} className="text-emerald-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">Fuel Management</h1>
          </div>
          <p className="text-slate-500 text-sm">Track fuel inventory, purchases, issuances, and ledger movements.</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedBranchId}
            onChange={e => setSelectedBranchId(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200"
          >
            <option value="ALL">All branches / companies</option>
            {branches.map(branch => (
              <option key={branch.id} value={branch.id}>{branch.company_name} - {branch.name}</option>
            ))}
          </select>
          <button onClick={fetchFuelData} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {!canAddPurchase && !canIssue && !canAdjust && <ReadOnlyNotice message="This user group can review fuel records only." />}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'border-emerald-500 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab !== 'overview' && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="relative max-w-sm flex-1 min-w-64">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search fuel records..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 bg-white"
            />
          </div>
          {canExport && (
            <div className="flex items-center gap-2">
              <button onClick={exportCsv} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold">
                <Download size={15} /> CSV
              </button>
              <button onClick={exportPdf} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold">
                <FileText size={15} /> PDF
              </button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
          <RefreshCw size={16} className="animate-spin" /> Loading fuel records...
        </div>
      ) : (
        <>
          {activeTab === 'overview' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {[
                  { label: 'Current Fuel Inventory', value: `${fmt(summary.currentLiters)} L`, sub: `Value: ${currency(summary.inventoryValue)}`, icon: <Fuel size={22} className="text-emerald-500" />, bg: 'bg-emerald-50' },
                  { label: 'Purchased This Month', value: `${fmt(summary.purchasedThisMonth)} L`, sub: `Total cost: ${currency(summary.purchaseCostThisMonth)}`, icon: <ArrowDownCircle size={22} className="text-sky-500" />, bg: 'bg-sky-50' },
                  { label: 'Issued This Month', value: `${fmt(summary.issuedThisMonth)} L`, sub: `Total value: ${currency(summary.issuedValueThisMonth)}`, icon: <ArrowUpCircle size={22} className="text-orange-500" />, bg: 'bg-orange-50' },
                  { label: 'Average Cost', value: `${currency(summary.averageCost)} / L`, sub: 'Weighted average', icon: <Database size={22} className="text-violet-500" />, bg: 'bg-violet-50' },
                ].map(card => (
                  <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-5">
                    <div className={`w-11 h-11 rounded-xl ${card.bg} flex items-center justify-center mb-4`}>
                      {card.icon}
                    </div>
                    <p className="text-sm text-slate-500 font-medium">{card.label}</p>
                    <p className="text-2xl font-bold text-slate-800 mt-1 tabular-nums">{card.value}</p>
                    <p className="text-xs text-slate-400 mt-1">{card.sub}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                <div className="xl:col-span-2 space-y-5">
                  <RecentIssuances rows={issuances.slice(0, 5)} onViewAll={() => setActiveTab('issuances')} />
                  <RecentPurchases rows={purchases.slice(0, 5)} onViewAll={() => setActiveTab('purchases')} />
                </div>
                <div className="space-y-5">
                  <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <h2 className="font-semibold text-slate-800 mb-4">Quick Actions</h2>
                    <div className="space-y-2">
                      {canAddPurchase && <button onClick={() => setActiveTab('purchases')} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold"><Plus size={15} /> Add Fuel Purchase</button>}
                      {canIssue && <button onClick={() => setActiveTab('issuances')} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm font-semibold"><Truck size={15} /> Issue Fuel</button>}
                      <button onClick={() => setActiveTab('history')} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold"><History size={15} /> View Inventory History</button>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <h2 className="font-semibold text-slate-800 mb-4">Fuel Issuance by Category</h2>
                    <DonutChart data={categoryChartData} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'purchases' && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
              {canAddPurchase && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 h-fit">
                  <h2 className="font-semibold text-slate-800 mb-4">Add Fuel Purchase</h2>
                  <form onSubmit={handlePurchaseSubmit} className="space-y-4">
                    <Field label="Date"><input required type="date" value={purchaseForm.purchase_date} onChange={e => setPurchaseForm(f => ({ ...f, purchase_date: e.target.value }))} className={inputClass} /></Field>
                    <Field label="Supplier"><input required value={purchaseForm.supplier} onChange={e => setPurchaseForm(f => ({ ...f, supplier: e.target.value }))} className={inputClass} placeholder="RTM Gas Station" /></Field>
                    <Field label="Reference"><input value={purchaseForm.reference_no} onChange={e => setPurchaseForm(f => ({ ...f, reference_no: e.target.value }))} className={inputClass} placeholder="PO-2026-0701-001" /></Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Liters"><input required type="number" min="0.01" step="0.01" value={purchaseForm.liters} onChange={e => setPurchaseForm(f => ({ ...f, liters: e.target.value }))} className={inputClass} /></Field>
                      <Field label="Price / L"><input required type="number" min="0" step="0.01" value={purchaseForm.unit_cost} onChange={e => setPurchaseForm(f => ({ ...f, unit_cost: e.target.value }))} className={inputClass} /></Field>
                    </div>
                    <Field label="Remarks"><textarea value={purchaseForm.remarks} onChange={e => setPurchaseForm(f => ({ ...f, remarks: e.target.value }))} className={`${inputClass} resize-none`} rows={2} /></Field>
                    <button disabled={saving} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold disabled:opacity-70">
                      {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                      Save Purchase
                    </button>
                  </form>
                </div>
              )}
              <div className={canAddPurchase ? 'xl:col-span-2' : 'xl:col-span-3'}>
                <PurchasesTable rows={pagedPurchases} />
                <Pagination page={purchaseCurrentPage} pageSize={PAGE_SIZE} totalItems={filteredPurchases.length} onPageChange={setPurchasePage} />
              </div>
            </div>
          )}

          {activeTab === 'issuances' && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
              {canIssue && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 h-fit">
                  <h2 className="font-semibold text-slate-800 mb-4">Issue Fuel</h2>
                  <form onSubmit={handleIssuanceSubmit} className="space-y-4">
                    <Field label="Date"><input required type="date" value={issuanceForm.issuance_date} onChange={e => setIssuanceForm(f => ({ ...f, issuance_date: e.target.value }))} className={inputClass} /></Field>
                    <Field label="Category">
                      <select value={issuanceForm.category} onChange={e => setIssuanceForm(f => ({ ...f, category: e.target.value }))} className={inputClass}>
                        {issueCategories.map(category => <option key={category} value={category}>{category}</option>)}
                      </select>
                    </Field>
                    <Field label="Hauler Truck">
                      <select value={issuanceForm.truck_id} onChange={e => handleTruckPick(e.target.value)} className={inputClass}>
                        <option value="">No truck selected</option>
                        {haulerTrucks.map(truck => <option key={truck.id} value={truck.id}>{truck.plate_number} - {truck.driver_name || 'No driver'}</option>)}
                      </select>
                    </Field>
                    <Field label="Issued To"><input required value={issuanceForm.issued_to} onChange={e => setIssuanceForm(f => ({ ...f, issued_to: e.target.value }))} className={inputClass} placeholder="Apex Hauling / Loader WA380" /></Field>
                    <Field label="Reference"><input value={issuanceForm.reference_no} onChange={e => setIssuanceForm(f => ({ ...f, reference_no: e.target.value }))} className={inputClass} placeholder="FI-2026-0702-015" /></Field>
                    <Field label="Liters"><input required type="number" min="0.01" step="0.01" value={issuanceForm.liters} onChange={e => setIssuanceForm(f => ({ ...f, liters: e.target.value }))} className={inputClass} /></Field>
                    <Field label="Remarks"><textarea value={issuanceForm.remarks} onChange={e => setIssuanceForm(f => ({ ...f, remarks: e.target.value }))} className={`${inputClass} resize-none`} rows={2} /></Field>
                    <button disabled={saving} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold disabled:opacity-70">
                      {saving ? <Loader2 size={15} className="animate-spin" /> : <ClipboardList size={15} />}
                      Issue Fuel
                    </button>
                  </form>
                </div>
              )}
              <div className={canIssue ? 'xl:col-span-2' : 'xl:col-span-3'}>
                <IssuancesTable rows={pagedIssuances} />
                <Pagination page={issuanceCurrentPage} pageSize={PAGE_SIZE} totalItems={filteredIssuances.length} onPageChange={setIssuancePage} />
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
              {canAdjust && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 h-fit">
                  <h2 className="font-semibold text-slate-800 mb-4">Inventory Adjustment</h2>
                  <form onSubmit={handleAdjustmentSubmit} className="space-y-4">
                    <Field label="Date"><input required type="date" value={adjustmentForm.movement_date} onChange={e => setAdjustmentForm(f => ({ ...f, movement_date: e.target.value }))} className={inputClass} /></Field>
                    <Field label="Liters Delta"><input required type="number" step="0.01" value={adjustmentForm.liters_delta} onChange={e => setAdjustmentForm(f => ({ ...f, liters_delta: e.target.value }))} className={inputClass} placeholder="Use negative for deduction" /></Field>
                    <Field label="Unit Cost"><input required type="number" min="0" step="0.01" value={adjustmentForm.unit_cost} onChange={e => setAdjustmentForm(f => ({ ...f, unit_cost: e.target.value }))} className={inputClass} /></Field>
                    <Field label="Reference"><input value={adjustmentForm.reference_no} onChange={e => setAdjustmentForm(f => ({ ...f, reference_no: e.target.value }))} className={inputClass} /></Field>
                    <Field label="Description"><textarea value={adjustmentForm.description} onChange={e => setAdjustmentForm(f => ({ ...f, description: e.target.value }))} className={`${inputClass} resize-none`} rows={2} /></Field>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={adjustmentForm.is_opening_balance} onChange={e => setAdjustmentForm(f => ({ ...f, is_opening_balance: e.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-200" />
                      Opening balance
                    </label>
                    <button disabled={saving} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold disabled:opacity-70">
                      {saving ? <Loader2 size={15} className="animate-spin" /> : <History size={15} />}
                      Save Movement
                    </button>
                  </form>
                </div>
              )}
              <div className={canAdjust ? 'xl:col-span-2' : 'xl:col-span-3'}>
                <HistoryTable rows={pagedLedger} canAdjust={canAdjust} onReverse={reverseMovement} saving={saving} />
                <Pagination page={historyCurrentPage} pageSize={PAGE_SIZE} totalItems={filteredLedger.length} onPageChange={setHistoryPage} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 bg-white';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

function RecentIssuances({ rows, onViewAll }: { rows: FuelIssuanceWithTruck[]; onViewAll: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800">Recent Fuel Issuances</h2>
        <button onClick={onViewAll} className="text-sm text-emerald-600 font-medium hover:text-emerald-700">View All</button>
      </div>
      <IssuancesTable rows={rows} compact />
    </div>
  );
}

function RecentPurchases({ rows, onViewAll }: { rows: FuelPurchase[]; onViewAll: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800">Recent Fuel Purchases</h2>
        <button onClick={onViewAll} className="text-sm text-emerald-600 font-medium hover:text-emerald-700">View All</button>
      </div>
      <PurchasesTable rows={rows} compact />
    </div>
  );
}

function PurchasesTable({ rows, compact = false }: { rows: FuelPurchase[]; compact?: boolean }) {
  return (
    <div className={compact ? 'overflow-hidden' : 'bg-white rounded-xl border border-slate-200 overflow-hidden'}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
              <th className="px-5 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Supplier</th>
              <th className="px-4 py-3 text-left">Reference</th>
              <th className="px-4 py-3 text-right">Liters</th>
              <th className="px-4 py-3 text-right">Price / L</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">No fuel purchases found</td></tr>
            ) : rows.map(item => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 whitespace-nowrap text-slate-600">{formatDate(item.purchase_date)}</td>
                <td className="px-4 py-3 text-slate-800 font-medium">{item.supplier}</td>
                <td className="px-4 py-3 text-slate-500 font-mono text-xs">{item.reference_no || '—'}</td>
                <td className="px-4 py-3 text-right text-emerald-600 font-semibold tabular-nums">{fmt(item.liters)} L</td>
                <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{currency(item.unit_cost)}</td>
                <td className="px-4 py-3 text-right text-slate-800 font-bold tabular-nums">{currency(item.total_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IssuancesTable({ rows, compact = false }: { rows: FuelIssuanceWithTruck[]; compact?: boolean }) {
  return (
    <div className={compact ? 'overflow-hidden' : 'bg-white rounded-xl border border-slate-200 overflow-hidden'}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
              <th className="px-5 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Category</th>
              <th className="px-4 py-3 text-left">Issued To</th>
              <th className="px-4 py-3 text-left">Reference</th>
              <th className="px-4 py-3 text-right">Liters</th>
              <th className="px-4 py-3 text-right">Price / L</th>
              <th className="px-4 py-3 text-right">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">No fuel issuances found</td></tr>
            ) : rows.map(item => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 whitespace-nowrap text-slate-600">{formatDate(item.issuance_date)}</td>
                <td className="px-4 py-3"><span className="inline-flex px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold">{item.category}</span></td>
                <td className="px-4 py-3 text-slate-800 font-medium">
                  {item.issued_to}
                  {item.trucks?.plate_number && <p className="text-xs text-slate-400 font-mono">{item.trucks.plate_number}</p>}
                </td>
                <td className="px-4 py-3 text-slate-500 font-mono text-xs">{item.reference_no || '—'}</td>
                <td className="px-4 py-3 text-right text-emerald-600 font-semibold tabular-nums">{fmt(item.liters)} L</td>
                <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{currency(item.unit_cost_snapshot)}</td>
                <td className="px-4 py-3 text-right text-slate-800 font-bold tabular-nums">{currency(item.total_value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HistoryTable({ rows, canAdjust, onReverse, saving }: { rows: FuelInventoryLedger[]; canAdjust: boolean; onReverse: (item: FuelInventoryLedger) => void; saving: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
              <th className="px-5 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Description</th>
              <th className="px-4 py-3 text-right">Liters</th>
              <th className="px-4 py-3 text-right">Value</th>
              <th className="px-4 py-3 text-right">Balance</th>
              {canAdjust && <th className="px-4 py-3 text-center">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr><td colSpan={canAdjust ? 7 : 6} className="px-4 py-12 text-center text-slate-400">No inventory movement found</td></tr>
            ) : rows.map(item => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 whitespace-nowrap text-slate-600">{formatDate(item.movement_date)}</td>
                <td className="px-4 py-3"><span className={`inline-flex px-2.5 py-1 rounded-full border text-xs font-semibold ${movementBadge(item.movement_type)}`}>{item.movement_type.replace('_', ' ')}</span></td>
                <td className="px-4 py-3 text-slate-800 font-medium">
                  {item.description || '—'}
                  <p className="text-xs text-slate-400 font-mono">{item.reference_no || 'No reference'}</p>
                </td>
                <td className={`px-4 py-3 text-right font-semibold tabular-nums ${item.liters_delta >= 0 ? 'text-emerald-600' : 'text-orange-600'}`}>{fmt(item.liters_delta)} L</td>
                <td className={`px-4 py-3 text-right tabular-nums ${item.value_delta >= 0 ? 'text-slate-700' : 'text-orange-600'}`}>{currency(item.value_delta)}</td>
                <td className="px-4 py-3 text-right text-slate-800 font-bold tabular-nums">{fmt(item.balance_liters_after)} L</td>
                {canAdjust && (
                  <td className="px-4 py-3 text-center">
                    {item.movement_type !== 'REVERSAL' && !item.reversal_of_ledger_id ? (
                      <button disabled={saving} onClick={() => onReverse(item)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold disabled:opacity-60">
                        Reverse
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
