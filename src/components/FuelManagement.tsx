import {
  Download,
  FileText,
  Fuel,
  RefreshCw,
  Search
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CompanyEquipment, FuelBranch, FuelInventoryLedger, FuelInventoryState, FuelPurchase, Truck as TruckType } from '../lib/database.types';
import { isWithinRange, useDateRange } from '../lib/dateRange';
import { fetchAllPages } from '../lib/fetchAll';
import { paginate } from '../lib/pagination';
import { supabase } from '../lib/supabase';
import ActionModal from './ActionModal';
import DateRangeFilter from './DateRangeFilter';
import { createFuelExports } from './fuel/createFuelExports';
import FuelEquipment from './fuel/FuelEquipment';
import FuelHistory from './fuel/FuelHistory';
import FuelIssuances from './fuel/FuelIssuances';
import FuelOverview from './fuel/FuelOverview';
import FuelPurchases from './fuel/FuelPurchases';
import { CATEGORY_COMPANY_EQUIPMENT, CATEGORY_COMPANY_TRUCK, CATEGORY_HAULER_OFFSET, FUEL_RECORDS_START, PAGE_SIZE, checkEntryDate, checkUnitCost, currency, equipmentBranchLabel, equipmentTypes, fmt, formatDate, formatEquipmentTarget, formatTruckTarget, isBackdated, issueCategories, monthStartInput, todayInput } from './fuel/fuelUtils';
import type { EntryCheck, EquipmentFormState, FuelIssuanceWithTarget, FuelManagementProps, FuelTab } from './fuel/types';
import ReadOnlyNotice from './ReadOnlyNotice';

export default function FuelManagement({
  canAddPurchase = false,
  canIssue = false,
  canEditPurchase = false,
  canEditIssuance = false,
  canAdjust = false,
  canExport = false,
  canManageEquipment = false,
}: FuelManagementProps) {
  const [activeTab, setActiveTab] = useState<FuelTab>('overview');
  const [branches, setBranches] = useState<FuelBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('ALL');
  const [states, setStates] = useState<FuelInventoryState[]>([]);
  const [purchases, setPurchases] = useState<FuelPurchase[]>([]);
  const [issuances, setIssuances] = useState<FuelIssuanceWithTarget[]>([]);
  const [ledger, setLedger] = useState<FuelInventoryLedger[]>([]);
  const [haulerTrucks, setHaulerTrucks] = useState<TruckType[]>([]);
  const [companyTrucks, setCompanyTrucks] = useState<TruckType[]>([]);
  const [companyEquipment, setCompanyEquipment] = useState<CompanyEquipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const fuelDates = useDateRange();
  const [issuanceCategoryFilter, setIssuanceCategoryFilter] = useState('ALL');
  const [purchasePage, setPurchasePage] = useState(1);
  const [issuancePage, setIssuancePage] = useState(1);
  const [equipmentPage, setEquipmentPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [ledgerOrder, setLedgerOrder] = useState<'encoded' | 'date'>('encoded');
  const fuelRequestId = useRef(0);

  const [purchaseForm, setPurchaseForm] = useState({
    purchase_date: todayInput(),
    supplier: '',
    reference_no: '',
    liters: '',
    unit_cost: '',
    remarks: '',
    post_to_expenses: true,
  });
  const [issuanceForm, setIssuanceForm] = useState({
    issuance_date: todayInput(),
    category: issueCategories[0],
    issued_to: '',
    truck_id: '',
    company_equipment_id: '',
    reference_no: '',
    liters: '',
    remarks: '',
  });
  const [equipmentForm, setEquipmentForm] = useState<EquipmentFormState>({
    branch_id: '',
    name: '',
    equipment_type: equipmentTypes[0],
    plate_or_code: '',
    operator_name: '',
    notes: '',
  });
  const [editingEquipment, setEditingEquipment] = useState<CompanyEquipment | null>(null);
  const [editEquipmentForm, setEditEquipmentForm] = useState<EquipmentFormState>({
    branch_id: '',
    name: '',
    equipment_type: equipmentTypes[0],
    plate_or_code: '',
    operator_name: '',
    notes: '',
  });
  const [equipmentSaving, setEquipmentSaving] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<FuelInventoryLedger | null>(null);
  const [reencodeAfterReverse, setReencodeAfterReverse] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<FuelPurchase | null>(null);
  const [editingIssuance, setEditingIssuance] = useState<FuelIssuanceWithTarget | null>(null);
  const [pendingSave, setPendingSave] = useState<{ kind: 'purchase' | 'issuance' | 'adjustment'; warnings: string[]; } | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<CompanyEquipment | null>(null);
  const [infoModal, setInfoModal] = useState('');
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
    const requestId = ++fuelRequestId.current;
    setLoading(true);
    setError('');
    try {
      const [branchResult, stateResult, purchaseResult, issuanceResult, ledgerResult, truckResult, equipmentResult] = await Promise.all([
        fetchAllPages<FuelBranch>(async (from, to) => {
          const page = await supabase.from('fuel_branches').select('*').eq('is_active', true).order('is_default', { ascending: false }).order('name').range(from, to);
          return { data: page.data as FuelBranch[] | null, error: page.error };
        }),
        fetchAllPages<FuelInventoryState>(async (from, to) => {
          const page = await supabase.from('fuel_inventory_state').select('*').order('id').range(from, to);
          return { data: page.data as FuelInventoryState[] | null, error: page.error };
        }),
        fetchAllPages<FuelPurchase>(async (from, to) => {
          let query = supabase.from('fuel_purchases').select('*').gte('purchase_date', FUEL_RECORDS_START).order('purchase_date', { ascending: false }).order('created_at', { ascending: false }).order('id');
          if (selectedBranchId !== 'ALL') query = query.eq('branch_id', selectedBranchId);
          const page = await query.range(from, to);
          return { data: page.data as FuelPurchase[] | null, error: page.error };
        }),
        fetchAllPages<FuelIssuanceWithTarget>(async (from, to) => {
          let query = supabase.from('fuel_issuances').select('*, trucks(*), company_equipment(*)').gte('issuance_date', FUEL_RECORDS_START).order('issuance_date', { ascending: false }).order('created_at', { ascending: false }).order('id');
          if (selectedBranchId !== 'ALL') query = query.eq('branch_id', selectedBranchId);
          const page = await query.range(from, to);
          return { data: page.data as FuelIssuanceWithTarget[] | null, error: page.error };
        }),
        fetchAllPages<FuelInventoryLedger>(async (from, to) => {
          let query = supabase.from('fuel_inventory_ledger').select('*').gte('movement_date', FUEL_RECORDS_START).order('movement_date', { ascending: false }).order('created_at', { ascending: false }).order('id');
          if (selectedBranchId !== 'ALL') query = query.eq('branch_id', selectedBranchId);
          const page = await query.range(from, to);
          return { data: page.data as FuelInventoryLedger[] | null, error: page.error };
        }),
        fetchAllPages<TruckType>(async (from, to) => {
          const page = await supabase.from('trucks').select('*').order('plate_number').range(from, to);
          return { data: page.data as TruckType[] | null, error: page.error };
        }),
        fetchAllPages<CompanyEquipment>(async (from, to) => {
          const page = await supabase.from('company_equipment').select('*').eq('is_active', true).order('equipment_type').order('name').range(from, to);
          return { data: page.data as CompanyEquipment[] | null, error: page.error };
        }),
      ]);

      if (requestId !== fuelRequestId.current) return;
      const firstError = branchResult.error || stateResult.error || purchaseResult.error || issuanceResult.error || ledgerResult.error || truckResult.error || equipmentResult.error;
      if (firstError) throw new Error(firstError.message);

      const truckRows = truckResult.data;
      setBranches(branchResult.data);
      setStates(stateResult.data);
      setPurchases(purchaseResult.data);
      setIssuances(issuanceResult.data);
      setLedger(ledgerResult.data);
      setHaulerTrucks(truckRows.filter(truck => truck.is_hauler));
      setCompanyTrucks(truckRows.filter(truck => !truck.is_hauler));
      setCompanyEquipment(equipmentResult.data);
    } catch (loadError) {
      if (requestId === fuelRequestId.current) {
        setError(`Fuel records could not be refreshed. Displayed records may be outdated. ${loadError instanceof Error ? loadError.message : 'Please try again.'}`);
      }
    } finally {
      if (requestId === fuelRequestId.current) setLoading(false);
    }
  }, [selectedBranchId]);

  useEffect(() => {
    fetchFuelData();
    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible') void fetchFuelData();
    };
    window.addEventListener('focus', refreshOnReturn);
    document.addEventListener('visibilitychange', refreshOnReturn);
    return () => {
      ++fuelRequestId.current;
      window.removeEventListener('focus', refreshOnReturn);
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
  }, [fetchFuelData]);

  useEffect(() => {
    setEquipmentForm(form => form.branch_id ? form : { ...form, branch_id: actionBranchId });
  }, [actionBranchId]);

  useEffect(() => {
    setPurchasePage(1);
    setIssuancePage(1);
    setEquipmentPage(1);
    setHistoryPage(1);
  }, [search, selectedBranchId, activeTab, ledgerOrder, fuelDates.from, fuelDates.to, issuanceCategoryFilter]);

  const filteredPurchases = useMemo(() => {
    const q = search.trim().toLowerCase();
    return purchases.filter(item =>
      isWithinRange(item.purchase_date, fuelDates.start, fuelDates.end) && (
        !q ||
        item.supplier.toLowerCase().includes(q) ||
        item.reference_no.toLowerCase().includes(q) ||
        item.remarks.toLowerCase().includes(q)
      )
    );
  }, [fuelDates.end, fuelDates.start, purchases, search]);

  const filteredIssuances = useMemo(() => {
    const q = search.trim().toLowerCase();
    return issuances.filter(item =>
      isWithinRange(item.issuance_date, fuelDates.start, fuelDates.end) &&
      (issuanceCategoryFilter === 'ALL' || item.category === issuanceCategoryFilter) && (
        !q ||
        item.category.toLowerCase().includes(q) ||
        item.issued_to.toLowerCase().includes(q) ||
        item.reference_no.toLowerCase().includes(q) ||
        (item.trucks?.plate_number ?? '').toLowerCase().includes(q) ||
        (item.company_equipment?.name ?? '').toLowerCase().includes(q) ||
        (item.company_equipment?.plate_or_code ?? '').toLowerCase().includes(q)
      ));
  }, [fuelDates.end, fuelDates.start, issuanceCategoryFilter, issuances, search]);

  // Issuance categories with how many issuances each has in the current date range.
  const issuanceCategoryOptions = useMemo(() => {
    const counts = new Map<string, number>(issueCategories.map(category => [category, 0]));
    issuances.forEach(item => {
      if (isWithinRange(item.issuance_date, fuelDates.start, fuelDates.end)) {
        counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
      }
    });
    return [...counts.entries()];
  }, [fuelDates.end, fuelDates.start, issuances]);

  const visibleCompanyEquipment = useMemo(() => {
    const scoped = companyEquipment.filter(item =>
      selectedBranchId === 'ALL' || !item.branch_id || item.branch_id === selectedBranchId
    );
    const q = search.trim().toLowerCase();
    if (!q || activeTab !== 'equipment') return scoped;
    return scoped.filter(item =>
      item.name.toLowerCase().includes(q) ||
      item.equipment_type.toLowerCase().includes(q) ||
      item.plate_or_code.toLowerCase().includes(q) ||
      item.operator_name.toLowerCase().includes(q) ||
      equipmentBranchLabel(item, branches).toLowerCase().includes(q)
    );
  }, [activeTab, branches, companyEquipment, search, selectedBranchId]);

  const availableCompanyEquipment = useMemo(() => (
    companyEquipment.filter(item => !item.branch_id || !actionBranchId || item.branch_id === actionBranchId)
  ), [actionBranchId, companyEquipment]);

  const filteredLedger = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = ledger.filter(item =>
      isWithinRange(item.movement_date, fuelDates.start, fuelDates.end) && (
        !q ||
        item.movement_type.toLowerCase().includes(q) ||
        item.reference_no.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      )
    );
    if (ledgerOrder === 'date') return rows;
    // Encoded order matches how the running balance was actually computed.
    return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  }, [fuelDates.end, fuelDates.start, ledger, ledgerOrder, search]);

  const backdatedLedgerCount = useMemo(
    () => filteredLedger.filter(item => isBackdated(item.movement_date, item.created_at)).length,
    [filteredLedger],
  );

  const reversal = useMemo(() => {
    const byId = new Map(ledger.map(item => [item.id, item]));
    const reversedLedgerIds = new Set<string>();
    const reversedSourceIds = new Set<string>();
    ledger.forEach(item => {
      if (!item.reversal_of_ledger_id) return;
      reversedLedgerIds.add(item.reversal_of_ledger_id);
      const original = byId.get(item.reversal_of_ledger_id);
      if (original?.source_id && (original.source_table === 'fuel_purchases' || original.source_table === 'fuel_issuances')) {
        reversedSourceIds.add(original.source_id);
      }
    });
    return { reversedLedgerIds, reversedSourceIds };
  }, [ledger]);

  const summary = useMemo(() => {
    const activePurchases = purchases.filter(item => !reversal.reversedSourceIds.has(item.id));
    const activeIssuances = issuances.filter(item => !reversal.reversedSourceIds.has(item.id));
    const scopedStates = selectedBranchId === 'ALL'
      ? states
      : states.filter(state => state.branch_id === selectedBranchId);
    const currentLiters = scopedStates.reduce((sum, state) => sum + (state.current_liters ?? 0), 0);
    const inventoryValue = scopedStates.reduce((sum, state) => sum + (state.inventory_value ?? 0), 0);
    const averageCost = currentLiters > 0 ? inventoryValue / currentLiters : 0;
    const purchasedThisMonth = activePurchases
      .filter(item => item.purchase_date >= monthStart)
      .reduce((sum, item) => sum + (item.liters ?? 0), 0);
    const purchaseCostThisMonth = activePurchases
      .filter(item => item.purchase_date >= monthStart)
      .reduce((sum, item) => sum + (item.total_amount ?? 0), 0);
    const issuedThisMonth = activeIssuances
      .filter(item => item.issuance_date >= monthStart)
      .reduce((sum, item) => sum + (item.liters ?? 0), 0);
    const issuedValueThisMonth = activeIssuances
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
  }, [issuances, monthStart, purchases, reversal, selectedBranchId, states]);

  const categoryChartData = useMemo(() => {
    const map: Record<string, number> = {};
    issuances
      .filter(item => item.issuance_date >= monthStart && !reversal.reversedSourceIds.has(item.id))
      .forEach(item => {
        map[item.category] = (map[item.category] ?? 0) + item.liters;
      });
    return Object.entries(map)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [issuances, monthStart, reversal]);

  const actionState = states.find(state => state.branch_id === actionBranchId) ?? null;
  const actionAverageCost = Number(actionState?.weighted_average_cost ?? 0);

  function runChecks(kind: 'purchase' | 'issuance' | 'adjustment', check: EntryCheck) {
    if (check.block) {
      setError(check.block);
      return;
    }
    setError('');
    if (check.warnings.length > 0) {
      setPendingSave({ kind, warnings: check.warnings });
      return;
    }
    void runSave(kind);
  }

  async function runSave(kind: 'purchase' | 'issuance' | 'adjustment') {
    setPendingSave(null);
    if (kind === 'purchase') await savePurchase();
    else if (kind === 'issuance') await saveIssuance();
    else await saveAdjustment();
  }

  function emptyPurchaseForm() {
    return { purchase_date: todayInput(), supplier: '', reference_no: '', liters: '', unit_cost: '', remarks: '', post_to_expenses: true };
  }

  function emptyIssuanceForm() {
    return { issuance_date: todayInput(), category: issueCategories[0], issued_to: '', truck_id: '', company_equipment_id: '', reference_no: '', liters: '', remarks: '' };
  }

  function startEditPurchase(item: FuelPurchase) {
    setError('');
    setEditingPurchase(item);
    setPurchaseForm({
      purchase_date: item.purchase_date,
      supplier: item.supplier,
      reference_no: item.reference_no,
      liters: String(item.liters),
      unit_cost: String(item.unit_cost),
      remarks: item.remarks,
      post_to_expenses: Boolean(item.expense_id),
    });
    setActiveTab('purchases');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEditPurchase() {
    setEditingPurchase(null);
    setPurchaseForm(emptyPurchaseForm());
  }

  function startEditIssuance(item: FuelIssuanceWithTarget) {
    setError('');
    setEditingIssuance(item);
    setIssuanceForm({
      issuance_date: item.issuance_date,
      category: item.category,
      issued_to: item.issued_to,
      truck_id: item.truck_id ?? '',
      company_equipment_id: item.company_equipment_id ?? '',
      reference_no: item.reference_no,
      liters: String(item.liters),
      remarks: item.remarks,
    });
    setActiveTab('issuances');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEditIssuance() {
    setEditingIssuance(null);
    setIssuanceForm(emptyIssuanceForm());
  }

  function handlePurchaseSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!actionBranchId && !editingPurchase) return;
    // Edits of old records do not need the late-entry remark; future dates are still blocked.
    const dateCheck = checkEntryDate(purchaseForm.purchase_date, editingPurchase ? null : purchaseForm.remarks);
    if (dateCheck.block) return runChecks('purchase', dateCheck);
    const liters = Number(purchaseForm.liters);
    const unitCost = Number(purchaseForm.unit_cost);
    if (editingPurchase && liters < Number(editingPurchase.liters)) {
      const editState = states.find(state => state.branch_id === editingPurchase.branch_id);
      const available = Number(editState?.current_liters ?? 0);
      const reduction = Number(editingPurchase.liters) - liters;
      if (reduction > available) {
        setError(`Cannot reduce this purchase by ${fmt(reduction)} L: only ${fmt(available)} L left in inventory (the rest was already issued).`);
        return;
      }
    }
    const reference = purchaseForm.reference_no.trim().toLowerCase();
    const supplier = purchaseForm.supplier.trim().toLowerCase();
    const duplicate = purchases.find(item =>
      item.id !== editingPurchase?.id &&
      item.branch_id === (editingPurchase?.branch_id ?? actionBranchId) &&
      !reversal.reversedSourceIds.has(item.id) &&
      ((reference && item.reference_no.trim().toLowerCase() === reference) ||
        (item.supplier.trim().toLowerCase() === supplier && item.purchase_date === purchaseForm.purchase_date && Number(item.liters) === liters))
    );
    const warnings = [...dateCheck.warnings, ...checkUnitCost(unitCost, actionAverageCost)];
    if (duplicate) {
      warnings.push(`A similar purchase already exists: ${duplicate.supplier} ${duplicate.reference_no ? `(${duplicate.reference_no}) ` : ''}on ${formatDate(duplicate.purchase_date)}, ${fmt(Number(duplicate.liters))} L.`);
    }
    if (editingPurchase?.expense_id) {
      warnings.push(`The linked Diesel expense will be updated to ${currency(Math.round(liters * unitCost * 100) / 100)}.`);
    }
    if (warnings.length > 0) warnings.push(`Total to be saved: ${currency(Math.round(liters * unitCost * 100) / 100)}.`);
    runChecks('purchase', { warnings });
  }

  // Blocks double-submit (double click / Enter pressed twice) while a save is in progress.
  const savePurchaseInFlight = useRef(false);
  async function savePurchase() {
    if (savePurchaseInFlight.current) return;
    savePurchaseInFlight.current = true;
    try {
      if (editingPurchase) {
        setSaving(true);
        setError('');
        const { error: updateError } = await supabase.rpc('update_fuel_purchase', {
          p_purchase_id: editingPurchase.id,
          p_purchase_date: purchaseForm.purchase_date,
          p_supplier: purchaseForm.supplier.trim(),
          p_reference_no: purchaseForm.reference_no.trim(),
          p_liters: Number(purchaseForm.liters),
          p_unit_cost: Number(purchaseForm.unit_cost),
          p_remarks: purchaseForm.remarks.trim(),
        });
        setSaving(false);
        if (updateError) {
          setError(updateError.message);
          return;
        }
        cancelEditPurchase();
        await fetchFuelData();
        return;
      }
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
        p_post_to_expenses: purchaseForm.post_to_expenses,
      });
      setSaving(false);

      if (rpcError) {
        setError(rpcError.message);
        return;
      }

      setPurchaseForm({ purchase_date: todayInput(), supplier: '', reference_no: '', liters: '', unit_cost: '', remarks: '', post_to_expenses: true });
      await fetchFuelData();
    } finally {
      savePurchaseInFlight.current = false;
    }
  }

  async function postPurchaseToExpenses(purchase: FuelPurchase) {
    if (!canAddPurchase || purchase.expense_id) return;
    setSaving(true);
    setError('');
    const { error: rpcError } = await supabase.rpc('post_fuel_purchase_to_expenses', { p_purchase_id: purchase.id });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    await fetchFuelData();
  }

  function handleIssuanceSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!actionBranchId && !editingIssuance) return;
    const dateCheck = checkEntryDate(issuanceForm.issuance_date, editingIssuance ? null : issuanceForm.remarks);
    if (dateCheck.block) return runChecks('issuance', dateCheck);
    const liters = Number(issuanceForm.liters);
    const issuanceState = editingIssuance ? states.find(state => state.branch_id === editingIssuance.branch_id) : actionState;
    const available = Number(issuanceState?.current_liters ?? 0);
    const extraLiters = editingIssuance ? liters - Number(editingIssuance.liters) : liters;
    if (extraLiters > available) {
      setError(`Not enough fuel in inventory${editingIssuance ? ` for the extra ${fmt(extraLiters)} L` : ''}. Available: ${fmt(available)} L. If a purchase is missing, encode the purchase first.`);
      return;
    }
    const warnings = [...dateCheck.warnings];
    if (editingIssuance && editingIssuance.category === CATEGORY_HAULER_OFFSET) {
      warnings.push("This is a Hauler Offset issuance. The hauler's statement in Accounts Ledger will change to match the edit.");
    }
    const laterPurchase = editingIssuance ? undefined : purchases.find(item =>
      item.branch_id === actionBranchId &&
      !reversal.reversedSourceIds.has(item.id) &&
      item.purchase_date > issuanceForm.issuance_date
    );
    if (laterPurchase) {
      warnings.push(`This issuance is dated before a purchase already encoded (${laterPurchase.supplier} on ${formatDate(laterPurchase.purchase_date)}). It will use today's stock and average cost (₱${actionAverageCost.toFixed(2)}/L), and will appear with an "Encoded" note in the ledger.`);
    }
    const issuedTo = issuanceForm.issued_to.trim().toLowerCase();
    const duplicate = issuances.find(item =>
      item.id !== editingIssuance?.id &&
      item.branch_id === (editingIssuance?.branch_id ?? actionBranchId) &&
      !reversal.reversedSourceIds.has(item.id) &&
      item.issuance_date === issuanceForm.issuance_date &&
      item.category === issuanceForm.category &&
      item.issued_to.trim().toLowerCase() === issuedTo &&
      Number(item.liters) === liters &&
      (item.reference_no ?? '').trim() === issuanceForm.reference_no.trim()
    );
    if (duplicate) {
      warnings.push(`An identical issuance already exists: ${duplicate.issued_to}, ${fmt(Number(duplicate.liters))} L on ${formatDate(duplicate.issuance_date)}. Save only if this is a separate fill-up.`);
    }
    runChecks('issuance', { warnings });
  }

  // Blocks double-submit (double click / Enter pressed twice) while a save is in progress.
  const saveIssuanceInFlight = useRef(false);
  async function saveIssuance() {
    if (saveIssuanceInFlight.current) return;
    saveIssuanceInFlight.current = true;
    try {
      if (!actionBranchId && !editingIssuance) return;
      if (issuanceForm.category === CATEGORY_HAULER_OFFSET && !issuanceForm.truck_id) {
        setError('Select a hauler truck before saving a Hauler Offset fuel issuance.');
        return;
      }
      if (issuanceForm.category === CATEGORY_COMPANY_TRUCK && !issuanceForm.truck_id) {
        setError('Select a company truck before saving this fuel issuance.');
        return;
      }
      if (issuanceForm.category === CATEGORY_COMPANY_EQUIPMENT && !issuanceForm.company_equipment_id) {
        setError('Select company equipment before saving this fuel issuance.');
        return;
      }
      if (editingIssuance) {
        setSaving(true);
        setError('');
        const { error: updateError } = await supabase.rpc('update_fuel_issuance', {
          p_issuance_id: editingIssuance.id,
          p_issuance_date: issuanceForm.issuance_date,
          p_category: issuanceForm.category,
          p_issued_to: issuanceForm.issued_to.trim(),
          p_truck_id: issuanceForm.category === CATEGORY_HAULER_OFFSET || issuanceForm.category === CATEGORY_COMPANY_TRUCK
            ? issuanceForm.truck_id || null
            : null,
          p_reference_no: issuanceForm.reference_no.trim(),
          p_liters: Number(issuanceForm.liters),
          p_remarks: issuanceForm.remarks.trim(),
          p_company_equipment_id: issuanceForm.category === CATEGORY_COMPANY_EQUIPMENT
            ? issuanceForm.company_equipment_id || null
            : null,
        });
        setSaving(false);
        if (updateError) {
          setError(updateError.message);
          return;
        }
        cancelEditIssuance();
        await fetchFuelData();
        return;
      }
      setSaving(true);
      setError('');
      const { error: rpcError } = await supabase.rpc('create_fuel_issuance', {
        p_branch_id: actionBranchId,
        p_issuance_date: issuanceForm.issuance_date,
        p_category: issuanceForm.category,
        p_issued_to: issuanceForm.issued_to.trim(),
        p_truck_id: issuanceForm.category === CATEGORY_HAULER_OFFSET || issuanceForm.category === CATEGORY_COMPANY_TRUCK
          ? issuanceForm.truck_id || null
          : null,
        p_reference_no: issuanceForm.reference_no.trim(),
        p_liters: Number(issuanceForm.liters),
        p_remarks: issuanceForm.remarks.trim(),
        p_company_equipment_id: issuanceForm.category === CATEGORY_COMPANY_EQUIPMENT
          ? issuanceForm.company_equipment_id || null
          : null,
      });
      setSaving(false);

      if (rpcError) {
        setError(rpcError.message);
        return;
      }

      setIssuanceForm({ issuance_date: todayInput(), category: issueCategories[0], issued_to: '', truck_id: '', company_equipment_id: '', reference_no: '', liters: '', remarks: '' });
      await fetchFuelData();
    } finally {
      saveIssuanceInFlight.current = false;
    }
  }

  function handleAdjustmentSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!actionBranchId) return;
    const dateCheck = checkEntryDate(adjustmentForm.movement_date, null);
    if (dateCheck.block) return runChecks('adjustment', dateCheck);
    const litersDelta = Number(adjustmentForm.liters_delta);
    const warnings = [...dateCheck.warnings];
    if (litersDelta > 0) warnings.push(...checkUnitCost(Number(adjustmentForm.unit_cost), actionAverageCost));
    const available = Number(actionState?.current_liters ?? 0);
    if (litersDelta < 0 && available + litersDelta < 0) {
      setError(`Adjustment would make inventory negative. Available: ${fmt(available)} L.`);
      return;
    }
    runChecks('adjustment', { warnings });
  }

  // Blocks double-submit (double click / Enter pressed twice) while a save is in progress.
  const saveAdjustmentInFlight = useRef(false);
  async function saveAdjustment() {
    if (saveAdjustmentInFlight.current) return;
    saveAdjustmentInFlight.current = true;
    try {
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
    } finally {
      saveAdjustmentInFlight.current = false;
    }
  }

  function reverseMovement(item: FuelInventoryLedger) {
    setReencodeAfterReverse(false);
    setReverseTarget(item);
  }

  function prefillFromReversed(item: FuelInventoryLedger) {
    setEditingPurchase(null);
    setEditingIssuance(null);
    if (item.movement_type === 'PURCHASE' && item.source_table === 'fuel_purchases') {
      const source = purchases.find(row => row.id === item.source_id);
      if (!source) return;
      setPurchaseForm({
        purchase_date: source.purchase_date,
        supplier: source.supplier,
        reference_no: source.reference_no,
        liters: String(source.liters),
        unit_cost: String(source.unit_cost),
        remarks: source.remarks,
        post_to_expenses: true,
      });
      setActiveTab('purchases');
    } else if (item.movement_type === 'ISSUANCE' && item.source_table === 'fuel_issuances') {
      const source = issuances.find(row => row.id === item.source_id);
      if (!source) return;
      setIssuanceForm({
        issuance_date: source.issuance_date,
        category: source.category,
        issued_to: source.issued_to,
        truck_id: source.truck_id ?? '',
        company_equipment_id: source.company_equipment_id ?? '',
        reference_no: source.reference_no,
        liters: String(source.liters),
        remarks: source.remarks,
      });
      setActiveTab('issuances');
    }
  }

  async function confirmReverseMovement() {
    if (!reverseTarget) return;
    setSaving(true);
    setError('');
    const { error: rpcError } = await supabase.rpc('reverse_fuel_movement', {
      p_ledger_id: reverseTarget.id,
      p_reason: `Reversal of ${reverseTarget.movement_type}`,
    });
    setSaving(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    const reversedItem = reverseTarget;
    setReverseTarget(null);
    if (reencodeAfterReverse) prefillFromReversed(reversedItem);
    await fetchFuelData();
  }

  function handleIssuanceCategoryChange(category: string) {
    setError('');
    setIssuanceForm(form => ({
      ...form,
      category,
      issued_to: '',
      truck_id: '',
      company_equipment_id: '',
    }));
  }

  function handleTruckPick(truckId: string, source: 'hauler' | 'company') {
    const trucks = source === 'hauler' ? haulerTrucks : companyTrucks;
    const truck = trucks.find(item => item.id === truckId);
    setIssuanceForm(form => ({
      ...form,
      truck_id: truckId,
      company_equipment_id: '',
      issued_to: truck ? formatTruckTarget(truck) : '',
    }));
  }

  function handleEquipmentPick(equipmentId: string) {
    const equipment = availableCompanyEquipment.find(item => item.id === equipmentId);
    setIssuanceForm(form => ({
      ...form,
      truck_id: '',
      company_equipment_id: equipmentId,
      issued_to: equipment ? formatEquipmentTarget(equipment) : '',
    }));
  }

  // Blocks double-submit (double click / Enter pressed twice) while a save is in progress.
  const handleEquipmentSubmitInFlight = useRef(false);
  async function handleEquipmentSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (handleEquipmentSubmitInFlight.current) return;
    handleEquipmentSubmitInFlight.current = true;
    try {
      if (!canManageEquipment || !equipmentForm.name.trim()) return;
      setEquipmentSaving(true);
      setError('');

      const { error: saveError } = await supabase.from('company_equipment').insert({
        branch_id: equipmentForm.branch_id || null,
        name: equipmentForm.name.trim(),
        equipment_type: equipmentForm.equipment_type.trim() || 'Other',
        plate_or_code: equipmentForm.plate_or_code.trim(),
        operator_name: equipmentForm.operator_name.trim(),
        notes: equipmentForm.notes.trim(),
        is_active: true,
      });
      setEquipmentSaving(false);

      if (saveError) {
        setError(saveError.message);
        return;
      }

      setEquipmentForm({ branch_id: actionBranchId, name: '', equipment_type: equipmentTypes[0], plate_or_code: '', operator_name: '', notes: '' });
      await fetchFuelData();
    } finally {
      handleEquipmentSubmitInFlight.current = false;
    }
  }

  function startEquipmentEdit(item: CompanyEquipment) {
    setEditingEquipment(item);
    setEditEquipmentForm({
      branch_id: item.branch_id ?? '',
      name: item.name,
      equipment_type: item.equipment_type,
      plate_or_code: item.plate_or_code,
      operator_name: item.operator_name,
      notes: item.notes,
    });
  }

  async function handleEquipmentEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canManageEquipment || !editingEquipment || !editEquipmentForm.name.trim()) return;
    setEquipmentSaving(true);
    setError('');

    const { error: saveError } = await supabase
      .from('company_equipment')
      .update({
        branch_id: editEquipmentForm.branch_id || null,
        name: editEquipmentForm.name.trim(),
        equipment_type: editEquipmentForm.equipment_type.trim() || 'Other',
        plate_or_code: editEquipmentForm.plate_or_code.trim(),
        operator_name: editEquipmentForm.operator_name.trim(),
        notes: editEquipmentForm.notes.trim(),
      })
      .eq('id', editingEquipment.id);
    setEquipmentSaving(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    setEditingEquipment(null);
    await fetchFuelData();
  }

  function deactivateEquipment(item: CompanyEquipment) {
    if (!canManageEquipment) return;
    setDeactivateTarget(item);
  }

  async function confirmDeactivateEquipment() {
    if (!canManageEquipment || !deactivateTarget) return;
    setEquipmentSaving(true);
    setError('');

    const { error: saveError } = await supabase
      .from('company_equipment')
      .update({ is_active: false })
      .eq('id', deactivateTarget.id);
    setEquipmentSaving(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    setDeactivateTarget(null);
    await fetchFuelData();
  }

  const usesDateFilter = activeTab === 'purchases' || activeTab === 'issuances' || activeTab === 'history';
  const fuelFiltersActive = usesDateFilter && (fuelDates.active || search.trim() !== '' || (activeTab === 'issuances' && issuanceCategoryFilter !== 'ALL'));
  const purchaseFilteredTotals = useMemo(() => filteredPurchases
    .filter(item => !reversal.reversedSourceIds.has(item.id))
    .reduce((sum, item) => ({ liters: sum.liters + Number(item.liters), amount: sum.amount + Number(item.total_amount) }), { liters: 0, amount: 0 }),
    [filteredPurchases, reversal]);
  const issuanceFilteredTotals = useMemo(() => filteredIssuances
    .filter(item => !reversal.reversedSourceIds.has(item.id))
    .reduce((sum, item) => ({ liters: sum.liters + Number(item.liters), amount: sum.amount + Number(item.total_value) }), { liters: 0, amount: 0 }),
    [filteredIssuances, reversal]);

  const { exportCsv, exportPdf } = createFuelExports({
    usesDateFilter,
    fuelDates,
    activeTab,
    issuanceCategoryFilter,
    search,
    filteredPurchases,
    reversal,
    purchaseFilteredTotals,
    filteredIssuances,
    issuanceFilteredTotals,
    visibleCompanyEquipment,
    branches,
    filteredLedger,
    selectedBranch,
    setInfoModal
  });

  const pagedPurchases = useMemo(() => paginate(filteredPurchases, Math.min(purchasePage, Math.max(1, Math.ceil(filteredPurchases.length / PAGE_SIZE))), PAGE_SIZE), [filteredPurchases, purchasePage]);
  const pagedIssuances = useMemo(() => paginate(filteredIssuances, Math.min(issuancePage, Math.max(1, Math.ceil(filteredIssuances.length / PAGE_SIZE))), PAGE_SIZE), [filteredIssuances, issuancePage]);
  const pagedEquipment = useMemo(() => paginate(visibleCompanyEquipment, Math.min(equipmentPage, Math.max(1, Math.ceil(visibleCompanyEquipment.length / PAGE_SIZE))), PAGE_SIZE), [equipmentPage, visibleCompanyEquipment]);
  const pagedLedger = useMemo(() => paginate(filteredLedger, Math.min(historyPage, Math.max(1, Math.ceil(filteredLedger.length / PAGE_SIZE))), PAGE_SIZE), [filteredLedger, historyPage]);
  const purchaseCurrentPage = Math.min(purchasePage, Math.max(1, Math.ceil(filteredPurchases.length / PAGE_SIZE)));
  const issuanceCurrentPage = Math.min(issuancePage, Math.max(1, Math.ceil(filteredIssuances.length / PAGE_SIZE)));
  const equipmentCurrentPage = Math.min(equipmentPage, Math.max(1, Math.ceil(visibleCompanyEquipment.length / PAGE_SIZE)));
  const historyCurrentPage = Math.min(historyPage, Math.max(1, Math.ceil(filteredLedger.length / PAGE_SIZE)));
  const isHaulerOffsetIssue = issuanceForm.category === CATEGORY_HAULER_OFFSET;
  const isCompanyTruckIssue = issuanceForm.category === CATEGORY_COMPANY_TRUCK;
  const isCompanyEquipmentIssue = issuanceForm.category === CATEGORY_COMPANY_EQUIPMENT;
  const usesStructuredIssuanceTarget = isHaulerOffsetIssue || isCompanyTruckIssue || isCompanyEquipmentIssue;

  const tabs: { id: FuelTab; label: string; }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'purchases', label: 'Fuel Purchases' },
    { id: 'issuances', label: 'Fuel Issuances' },
    { id: 'equipment', label: 'Company Equipment' },
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

      {!canAddPurchase && !canIssue && !canAdjust && !canManageEquipment && <ReadOnlyNotice message="This user group can review fuel records only." />}

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
            className={`px-3 py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${activeTab === tab.id
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
              {fuelFiltersActive && <span className="text-xs text-slate-500">Exports follow the filters</span>}
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

      {usesDateFilter && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <DateRangeFilter range={fuelDates} />
            {activeTab === 'issuances' && (
              <select
                value={issuanceCategoryFilter}
                onChange={e => setIssuanceCategoryFilter(e.target.value)}
                aria-label="Filter by category"
                className={`rounded-lg border bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 ${issuanceCategoryFilter === 'ALL' ? 'border-slate-200 text-slate-600' : 'border-emerald-300 font-medium text-emerald-700'
                  }`}
              >
                <option value="ALL">All categories</option>
                {issuanceCategoryOptions.map(([category, count]) => (
                  <option key={category} value={category}>{category} ({count})</option>
                ))}
              </select>
            )}
          </div>
          {fuelFiltersActive && activeTab !== 'history' && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-4 py-2.5 text-sm">
              <span className="text-slate-600">
                {activeTab === 'purchases'
                  ? <>{filteredPurchases.length} {filteredPurchases.length === 1 ? 'purchase' : 'purchases'} · <span className="font-bold text-slate-800">{fmt(purchaseFilteredTotals.liters)} L</span> · Total <span className="font-bold text-slate-800">{currency(purchaseFilteredTotals.amount)}</span></>
                  : <>{filteredIssuances.length} {filteredIssuances.length === 1 ? 'issuance' : 'issuances'}{issuanceCategoryFilter !== 'ALL' && <> in <span className="font-semibold text-slate-800">{issuanceCategoryFilter}</span></>} · <span className="font-bold text-slate-800">{fmt(issuanceFilteredTotals.liters)} L</span> · Value <span className="font-bold text-slate-800">{currency(issuanceFilteredTotals.amount)}</span></>}
                {fuelDates.active && <> · <span className="font-semibold text-slate-800">{fuelDates.label}</span></>}
                <span className="text-slate-400"> (totals exclude reversed)</span>
              </span>
              <button
                type="button"
                onClick={() => { fuelDates.applyPreset('ALL'); setIssuanceCategoryFilter('ALL'); setSearch(''); }}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
              >
                Clear filters
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
          <FuelOverview
            activeTab={activeTab}
            summary={summary}
            issuances={issuances}
            reversal={reversal}
            setActiveTab={setActiveTab}
            purchases={purchases}
            canAddPurchase={canAddPurchase}
            canIssue={canIssue}
            categoryChartData={categoryChartData}
          />

          <FuelPurchases
            activeTab={activeTab}
            canAddPurchase={canAddPurchase}
            editingPurchase={editingPurchase}
            handlePurchaseSubmit={handlePurchaseSubmit}
            purchaseForm={purchaseForm}
            setPurchaseForm={setPurchaseForm}
            saving={saving}
            cancelEditPurchase={cancelEditPurchase}
            pagedPurchases={pagedPurchases}
            reversal={reversal}
            postPurchaseToExpenses={postPurchaseToExpenses}
            canEditPurchase={canEditPurchase}
            startEditPurchase={startEditPurchase}
            purchaseCurrentPage={purchaseCurrentPage}
            filteredPurchases={filteredPurchases}
            setPurchasePage={setPurchasePage}
          />

          <FuelIssuances
            activeTab={activeTab}
            canIssue={canIssue}
            editingIssuance={editingIssuance}
            handleIssuanceSubmit={handleIssuanceSubmit}
            issuanceForm={issuanceForm}
            setIssuanceForm={setIssuanceForm}
            handleIssuanceCategoryChange={handleIssuanceCategoryChange}
            isHaulerOffsetIssue={isHaulerOffsetIssue}
            handleTruckPick={handleTruckPick}
            haulerTrucks={haulerTrucks}
            isCompanyTruckIssue={isCompanyTruckIssue}
            companyTrucks={companyTrucks}
            isCompanyEquipmentIssue={isCompanyEquipmentIssue}
            handleEquipmentPick={handleEquipmentPick}
            availableCompanyEquipment={availableCompanyEquipment}
            usesStructuredIssuanceTarget={usesStructuredIssuanceTarget}
            saving={saving}
            cancelEditIssuance={cancelEditIssuance}
            pagedIssuances={pagedIssuances}
            reversal={reversal}
            canEditIssuance={canEditIssuance}
            startEditIssuance={startEditIssuance}
            issuanceCurrentPage={issuanceCurrentPage}
            filteredIssuances={filteredIssuances}
            setIssuancePage={setIssuancePage}
          />

          <FuelEquipment
            activeTab={activeTab}
            canManageEquipment={canManageEquipment}
            handleEquipmentSubmit={handleEquipmentSubmit}
            equipmentForm={equipmentForm}
            setEquipmentForm={setEquipmentForm}
            branches={branches}
            equipmentSaving={equipmentSaving}
            pagedEquipment={pagedEquipment}
            editingEquipment={editingEquipment}
            editEquipmentForm={editEquipmentForm}
            setEditEquipmentForm={setEditEquipmentForm}
            startEquipmentEdit={startEquipmentEdit}
            setEditingEquipment={setEditingEquipment}
            handleEquipmentEditSubmit={handleEquipmentEditSubmit}
            deactivateEquipment={deactivateEquipment}
            equipmentCurrentPage={equipmentCurrentPage}
            visibleCompanyEquipment={visibleCompanyEquipment}
            setEquipmentPage={setEquipmentPage}
          />

          <FuelHistory
            activeTab={activeTab}
            canAdjust={canAdjust}
            handleAdjustmentSubmit={handleAdjustmentSubmit}
            adjustmentForm={adjustmentForm}
            setAdjustmentForm={setAdjustmentForm}
            saving={saving}
            backdatedLedgerCount={backdatedLedgerCount}
            setLedgerOrder={setLedgerOrder}
            ledgerOrder={ledgerOrder}
            pagedLedger={pagedLedger}
            reversal={reversal}
            reverseMovement={reverseMovement}
            historyCurrentPage={historyCurrentPage}
            filteredLedger={filteredLedger}
            setHistoryPage={setHistoryPage}
          />
        </>
      )}

      <ActionModal
        open={!!reverseTarget}
        title="Reverse Fuel Movement"
        description="This will create a reversing ledger entry for the selected movement."
        variant="warning"
        confirmLabel="Reverse Movement"
        loading={saving}
        onClose={() => setReverseTarget(null)}
        onConfirm={confirmReverseMovement}
      >
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Type</p>
            <p className="mt-1 font-bold text-slate-800">{reverseTarget?.movement_type.replace('_', ' ')}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Liters</p>
            <p className="mt-1 font-bold text-slate-800">{reverseTarget ? `${fmt(reverseTarget.liters_delta)} L` : '-'}</p>
          </div>
        </div>
        {reverseTarget && (() => {
          const state = states.find(item => item.branch_id === reverseTarget.branch_id);
          const currentLiters = Number(state?.current_liters ?? 0);
          const currentValue = Number(state?.inventory_value ?? 0);
          const nextLiters = currentLiters - Number(reverseTarget.liters_delta);
          const rawValue = currentValue - Number(reverseTarget.value_delta);
          const nextValue = Math.max(rawValue, 0);
          const canReencode = (reverseTarget.movement_type === 'PURCHASE' && canAddPurchase) || (reverseTarget.movement_type === 'ISSUANCE' && canIssue);
          return (
            <div className="mt-3 space-y-2 text-sm">
              <div className="rounded-lg border border-slate-200 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Inventory after reversal</p>
                <p className="mt-1 text-slate-700">
                  {fmt(currentLiters)} L → <span className={`font-bold ${nextLiters < 0 ? 'text-red-600' : 'text-slate-900'}`}>{fmt(nextLiters)} L</span>
                  <span className="text-slate-400"> · </span>
                  {currency(currentValue)} → <span className="font-bold text-slate-900">{currency(nextValue)}</span>
                </p>
              </div>
              {nextLiters < 0 && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">Not allowed: this fuel has already been issued. Reverse the related issuances first.</p>}
              {nextLiters >= 0 && rawValue < 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">Inventory value will be set to ₱0 while liters remain. Consider an adjustment to correct the value afterwards.</p>}
              {canReencode && nextLiters >= 0 && (
                <label className="flex items-center gap-2 text-slate-700">
                  <input type="checkbox" checked={reencodeAfterReverse} onChange={e => setReencodeAfterReverse(e.target.checked)} className="h-4 w-4 accent-emerald-500" />
                  Re-encode after reversing (opens the form with this entry's details)
                </label>
              )}
            </div>
          );
        })()}
      </ActionModal>

      <ActionModal
        open={!!pendingSave}
        title="Please double-check"
        description="Review the following before saving."
        variant="warning"
        confirmLabel="Save Anyway"
        cancelLabel="Go Back"
        loading={saving}
        onClose={() => setPendingSave(null)}
        onConfirm={() => pendingSave ? runSave(pendingSave.kind) : undefined}
      >
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
          {pendingSave?.warnings.map(warning => <li key={warning}>{warning}</li>)}
        </ul>
      </ActionModal>

      <ActionModal
        open={!!deactivateTarget}
        title="Deactivate Equipment"
        description="This equipment will be hidden from future fuel issuance selections."
        variant="warning"
        confirmLabel="Deactivate"
        loading={equipmentSaving}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={confirmDeactivateEquipment}
      >
        <p className="text-sm text-slate-600">
          Deactivate <span className="font-semibold text-slate-900">{deactivateTarget?.name}</span>?
        </p>
      </ActionModal>

      <ActionModal
        open={!!infoModal}
        title="Export Blocked"
        description={infoModal}
        variant="info"
        confirmLabel="Got It"
        showCancel={false}
        onClose={() => setInfoModal('')}
        onConfirm={() => setInfoModal('')}
      />
    </div>
  );
}
