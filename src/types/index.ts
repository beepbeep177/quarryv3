export type NavSection =
  | 'dashboard'
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
  | 'operations-stone-crusher'
  | 'operations-sand-washing'
  | 'operations-quarry-site'
  | 'reports'
  | 'access-control';

export interface NavItem {
  id: NavSection;
  label: string;
  icon?: string;
  children?: NavItem[];
}
