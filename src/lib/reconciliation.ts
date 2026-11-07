export interface ReconciliationBranch {
  id: string;
  name: string;
  opening_liters: number;
  movement_liters: number;
  closing_liters: number;
  closing_value: number;
  state_liters: number | null;
  state_value: number | null;
  missing_state: boolean;
  liters_difference: number | null;
  value_difference: number | null;
}
export interface DailyReconciliationResult {
  date: string;
  generated_at: string;
  is_today: boolean;
  sales: {
    count: number; total: number; net_sales: number; volume: number;
    allocation_difference: number; allocation_mismatches: number;
    receivables_created: number; direct_collections: number;
    receivable_collections: number; customer_credit_used: number;
  };
  expenses: number;
  credit: {
    opening: number; credits: number; debits: number; closing: number;
    negative_customers: number; expected_deductions: number;
    posted_deductions: number; deduction_mismatches: number;
  };
  fuel: {
    branches: ReconciliationBranch[];
    source_mismatches: number;
    purchases_liters: number;
    issuances_liters: number;
    source_issues: { source_table: string; id: string; branch_id: string; liters_difference: number; value_difference: number }[];
  };
  credit_issues: { source_table: string; source_id: string; expected: number; posted: number }[];
}
export type CheckStatus = 'balanced' | 'issue' | 'not-compared';
export interface ReconciliationCheck { label: string; status: CheckStatus; detail: string }
const fmt = (value: number) => value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const peso = (value: number) => `PHP ${fmt(value)}`;
export const liters = (value: number) => `${fmt(value)} L`;

export function reconciliationChecks(report: DailyReconciliationResult): ReconciliationCheck[] {
  const creditDifference = report.credit.expected_deductions - report.credit.posted_deductions;
  const fuelDrift = report.fuel.branches.filter(branch => branch.missing_state || Math.abs(branch.liters_difference ?? 0) > 0.005 || Math.abs(branch.value_difference ?? 0) > 0.005);
  return [
    { label: 'Sales payment allocations', status: report.sales.allocation_mismatches > 0 ? 'issue' : 'balanced', detail: `${report.sales.allocation_mismatches} transaction(s) differ; net difference ${peso(report.sales.allocation_difference)}.` },
    { label: 'Customer credit deductions', status: report.credit.deduction_mismatches > 0 ? 'issue' : 'balanced', detail: `${report.credit.deduction_mismatches} source mismatch(es); expected ${peso(report.credit.expected_deductions)}, posted ${peso(report.credit.posted_deductions)}; difference ${peso(creditDifference)}.` },
    { label: 'Fuel purchase / issuance postings', status: report.fuel.source_mismatches > 0 ? 'issue' : 'balanced', detail: `${report.fuel.source_mismatches} source record(s) differ from their original movements plus edit corrections.` },
    { label: 'Fuel inventory vs movement ledger', status: !report.is_today ? 'not-compared' : fuelDrift.length > 0 ? 'issue' : 'balanced', detail: report.is_today ? `${fuelDrift.length} branch(es) differ from the current inventory snapshot or have no inventory state.` : 'Historical closing quantities are shown below. Current inventory is compared only for today.' },
  ];
}
