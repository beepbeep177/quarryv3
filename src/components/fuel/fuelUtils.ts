import type { CompanyEquipment, FuelBranch, FuelInventoryLedger, Truck as TruckType } from '../../lib/database.types';
import { todayBusinessDate } from '../../lib/date';
import type { EntryCheck } from './types';
export const PAGE_SIZE = 8;

export const issueCategories = ['Hauler Offset', 'Company Equipment', 'Company Truck', 'Parts / Errand', 'Owner / Personal'];

export const equipmentTypes = ['Loader', 'Backhoe', 'Car', 'Service Vehicle', 'Generator', 'Other'];

export const CATEGORY_HAULER_OFFSET = 'Hauler Offset';

export const CATEGORY_COMPANY_EQUIPMENT = 'Company Equipment';

export const CATEGORY_COMPANY_TRUCK = 'Company Truck';

export function todayInput() {
  return todayBusinessDate();
}

// Fuel Management hides earlier records; other ledgers still include them.
// Client-requested fresh start from September 28, 2026.
export const FUEL_RECORDS_START = '2026-09-28';

export const MAX_BACKDATE_DAYS = 30;

export const REMARK_REQUIRED_AFTER_DAYS = 7;

export const MAX_PRICE_PER_LITER = 200;

export const PRICE_DEVIATION_LIMIT = 0.3;

export function daysBetween(fromDate: string, toDate: string) {
  return Math.round((new Date(`${toDate}T00:00:00`).getTime() - new Date(`${fromDate}T00:00:00`).getTime()) / 86400000);
}

export function checkEntryDate(date: string, remarks: string | null): EntryCheck {
  const today = todayInput();
  if (!date) return { block: 'Enter a date.', warnings: [] };
  if (date > today) return { block: 'The date cannot be in the future.', warnings: [] };
  const age = daysBetween(date, today);
  if (remarks !== null && age > REMARK_REQUIRED_AFTER_DAYS && !remarks.trim()) {
    return { block: `This entry is ${age} days old. Add a remark explaining the late entry (e.g. "from logbook").`, warnings: [] };
  }
  return { warnings: age > MAX_BACKDATE_DAYS ? [`The date is ${age} days ago. Make sure the month and year are correct.`] : [] };
}

export function checkUnitCost(unitCost: number, averageCost: number): string[] {
  if (!(unitCost > 0)) return [];
  if (unitCost > MAX_PRICE_PER_LITER) {
    return [`Price / L is ₱${unitCost.toLocaleString('en-PH')} per liter. Did you enter the total amount instead of the price per liter?`];
  }
  if (averageCost > 0 && Math.abs(unitCost - averageCost) / averageCost > PRICE_DEVIATION_LIMIT) {
    const pct = Math.round(((unitCost - averageCost) / averageCost) * 100);
    return [`Price / L (₱${unitCost.toFixed(2)}) is ${pct > 0 ? '+' : ''}${pct}% from the current average cost (₱${averageCost.toFixed(2)}).`];
  }
  return [];
}

export function monthStartInput() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), '01'].join('-');
}

export function fmt(v: number) {
  return v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function currency(v: number) {
  return `₱${fmt(v)}`;
}

export function csvEscape(value: string | number) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function downloadTextFile(filename: string, content: string, mimeType: string) {
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

export function htmlEscape(value: string | number) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function localDateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function isBackdated(transactionDate: string, createdAt?: string | null) {
  if (!createdAt) return false;
  const encoded = localDateKey(createdAt);
  return Boolean(encoded) && encoded > transactionDate;
}

export function formatTruckTarget(truck: TruckType) {
  return `${truck.plate_number}${truck.driver_name ? ` - ${truck.driver_name}` : ''}`;
}

export function formatEquipmentTarget(equipment: CompanyEquipment) {
  return [
    equipment.name,
    equipment.plate_or_code ? `/ ${equipment.plate_or_code}` : '',
    equipment.operator_name ? `(${equipment.operator_name})` : '',
  ].filter(Boolean).join(' ');
}

export function equipmentBranchLabel(equipment: CompanyEquipment, branches: FuelBranch[]) {
  if (!equipment.branch_id) return 'All branches';
  const branch = branches.find(item => item.id === equipment.branch_id);
  return branch ? `${branch.company_name} - ${branch.name}` : 'Assigned branch';
}

export function movementBadge(type: FuelInventoryLedger['movement_type']) {
  const map: Record<FuelInventoryLedger['movement_type'], string> = {
    OPENING_BALANCE: 'bg-sky-50 text-sky-700 border-sky-200',
    PURCHASE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    ISSUANCE: 'bg-orange-50 text-orange-700 border-orange-200',
    ADJUSTMENT: 'bg-violet-50 text-violet-700 border-violet-200',
    REVERSAL: 'bg-rose-50 text-rose-700 border-rose-200',
  };
  return map[type];
}

export const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 bg-white';
