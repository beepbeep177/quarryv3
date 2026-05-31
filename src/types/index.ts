export type NavSection =
  | 'dashboard'
  | 'daily-add'
  | 'daily-view'
  | 'customers-list'
  | 'customers-ar'
  | 'logistics-trucks'
  | 'logistics-pricing'
  | 'expenses'
  | 'reports'
  | 'access-control';

export interface NavItem {
  id: NavSection;
  label: string;
  icon?: string;
  children?: NavItem[];
}
