import type { Customer, CustomerCreditLedgerRow, HaulerOffsetLedgerRow, TransactionWithRelations, Truck as TruckType } from '../../lib/database.types';
export type HaulerTruck = TruckType & { customers?: Customer | null; };

export type LedgerEntry = HaulerOffsetLedgerRow & { row_kind: 'ENTRY'; };

export type CustomerCreditLedgerEntry = CustomerCreditLedgerRow & { row_kind: 'ENTRY'; };

export type ManualType = 'HAULING_SERVICE' | 'CASH_PAYMENT' | 'OPENING_BALANCE' | 'ADJUSTMENT';

export type CustomerCreditManualType = 'ADVANCE_PAYMENT' | 'OPENING_BALANCE' | 'ADJUSTMENT';

export type EntrySide = 'DEBIT' | 'CREDIT';

export type QuickFilter = 'THIS_MONTH' | 'LAST_MONTH' | 'THIS_QUARTER' | 'CUSTOM';

export type OffsetLedgerTab = 'HAULER' | 'CUSTOMER';

export type CustomerStatusFilter = 'ALL' | 'PENDING' | 'PAID';

export interface HaulingLineItem {
  id: string;
  truck_id: string;
  truck_plate: string;
  driver_name: string;
  trips: string;
  rate_per_trip: string;
}

export interface HaulerOffsetLedgerProps {
  canAdd?: boolean;
  canAdjust?: boolean;
  canExport?: boolean;
  canViewDetail?: boolean;
  canViewStatement?: boolean;
  canExportStatement?: boolean;
  canCustomerCreditAdd?: boolean;
  canCustomerCreditAdjust?: boolean;
  canCustomerCreditExport?: boolean;
}

export interface EntryForm {
  transaction_type: ManualType;
  transaction_date: string;
  reference_no: string;
  description: string;
  amount: string;
  entry_side: EntrySide;
  remarks: string;
  trip_count: string;
  truck_count: string;
  truck_id: string;
  truck_plate: string;
  driver_name: string;
  rate_per_trip: string;
  hauling_items: HaulingLineItem[];
  payment_method: string;
  payment_reference: string;
  reason: string;
}

export interface CustomerCreditForm {
  transaction_type: CustomerCreditManualType;
  transaction_date: string;
  reference_no: string;
  description: string;
  amount: string;
  entry_side: EntrySide;
  remarks: string;
}

export type CustomerOffsetRow = TransactionWithRelations & {
  offset_amount: number;
  running_total: number;
};
