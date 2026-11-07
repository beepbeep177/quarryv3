export type NavSection =
  | 'dashboard'
  | 'reconciliation'
  | 'daily-add'
  | 'daily-view'
  | 'customers-list'
  | 'customers-ar'
  | 'logistics-trucks'
  | 'logistics-pricing'
  | 'expenses'
  | 'fuel-management'
  | 'hauler-offset-ledger'
  | 'operations'
  | 'operations-dashboard'
  | 'operations-stone-crusher'
  | 'operations-sand-washing'
  | 'operations-quarry-site'
  | 'operations-wobbler'
  | 'workforce-employees'
  | 'workforce-attendance'
  | 'workforce-payroll'
  | 'workforce-cash-advances'
  | 'workforce-settings'
  | 'reports'
  | 'access-control';

export interface NavItem {
  id: NavSection;
  label: string;
  icon?: string;
  children?: NavItem[];
}
