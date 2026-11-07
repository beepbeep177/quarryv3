import type { TransactionWithRelations } from '../../lib/database.types';
export type ReportTab = 'sales' | 'customers' | 'expenses' | 'net' | 'products' | 'hourly';

export type PeriodMode = 'CUSTOM' | 'MONTHLY' | 'YEARLY';

export type Grouping = 'DAY' | 'WEEK' | 'MONTH';

export type ExtraFeeFilter = 'ALL' | 'dr_capitol' | 'delivery_fee' | 'passway' | 'kulot';

export interface SalesSummary {
  bucketStart: string;
  count: number;
  volume: number;
  cash: number;
  po: number;
  offset: number;
  gcash: number;
  bankTransfer: number;
  customerCredit: number;
  drFees: number;
  deliveryFees: number;
  extraFees: number;
  total: number;
}

export interface CustomerSalesSummary {
  bucketStart: string;
  count: number;
  volume: number;
  total: number;
  customerIds: Set<string>;
}

export interface NetIncomeSummary {
  bucketStart: string;
  revenue: number;
  expenses: number;
}

export interface ExpenseSummaryRow {
  bucketStart: string;
  count: number;
  total: number;
  byCategory: Record<string, number>;
}

export interface DateRangeSummary {
  start: string;
  end: string;
  label: string;
  salesGrouping: 'DAY' | 'MONTH';
}

export interface ProductSalesSummary {
  materialType: string;
  quantity: number;
  volume: number;
  revenue: number;
}

export interface HourlyKpiSummary {
  hour: number;
  label: string;
  count: number;
  volume: number;
  netSales: number;
  cash: number;
  po: number;
  offset: number;
  gcash: number;
  bankTransfer: number;
  customerCredit: number;
}

export interface FinancialLineItem {
  label: string;
  amount: number;
  share: number;
}

export interface ExportReportData {
  title: string;
  filename: string;
  filterLines: string[];
  headers: string[];
  rows: (string | number)[][];
  totals?: (string | number)[];
}

export interface ReportsProps {
  initialTab?: ReportTab;
  refreshKey?: number;
  canEditTransactions?: boolean;
  canExport?: boolean;
  canPrint?: boolean;
  onEditTransaction?: (tx: TransactionWithRelations) => void;
}
