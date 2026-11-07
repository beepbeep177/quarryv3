import type { NavSection } from '../types';

const sections: readonly NavSection[] = [
  'dashboard', 'reconciliation', 'daily-add', 'daily-view', 'customers-list', 'customers-ar',
  'logistics-trucks', 'logistics-pricing', 'expenses', 'fuel-management',
  'hauler-offset-ledger', 'operations', 'operations-dashboard',
  'operations-stone-crusher', 'operations-sand-washing',
  'operations-quarry-site', 'operations-wobbler', 'reports', 'access-control',
  'workforce-employees', 'workforce-attendance', 'workforce-payroll',
  'workforce-cash-advances', 'workforce-settings',
];

export function sectionHref(section: NavSection): string {
  return `#/${section}`;
}

export function sectionFromHash(hash: string): NavSection {
  const section = hash.replace(/^#\/?/, '');
  return sections.find(value => value === section) ?? 'dashboard';
}

export function isPlainNavigation(event: {
  button: number; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean;
}): boolean {
  return event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
}
