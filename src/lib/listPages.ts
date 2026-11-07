import type { Customer, TransactionWithRelations } from './database.types';

export interface DailyLedgerPage {
  rows: TransactionWithRelations[];
  total_count: number;
  total_volume: number;
  total_amount: number;
  products: string[];
  page: number;
}
export interface CustomerPage {
  rows: Customer[];
  total_count: number;
  registered_count: number;
  page: number;
}
export const EMPTY_LEDGER_PAGE: DailyLedgerPage = { rows: [], total_count: 0, total_volume: 0, total_amount: 0, products: [], page: 1 };
export const EMPTY_CUSTOMER_PAGE: CustomerPage = { rows: [], total_count: 0, registered_count: 0, page: 1 };
