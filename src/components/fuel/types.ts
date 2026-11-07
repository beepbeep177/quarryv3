import type { CompanyEquipment, FuelIssuance, Truck as TruckType } from '../../lib/database.types';
export type FuelTab = 'overview' | 'purchases' | 'issuances' | 'equipment' | 'history';

export type FuelIssuanceWithTarget = FuelIssuance & {
  trucks?: TruckType | null;
  company_equipment?: CompanyEquipment | null;
};

export interface FuelManagementProps {
  canAddPurchase?: boolean;
  canIssue?: boolean;
  canEditPurchase?: boolean;
  canEditIssuance?: boolean;
  canAdjust?: boolean;
  canExport?: boolean;
  canManageEquipment?: boolean;
}

export interface EquipmentFormState {
  branch_id: string;
  name: string;
  equipment_type: string;
  plate_or_code: string;
  operator_name: string;
  notes: string;
}

export type EntryCheck = { block?: string; warnings: string[]; };

export type PurchaseFormState = { purchase_date: string; supplier: string; reference_no: string; liters: string; unit_cost: string; remarks: string; post_to_expenses: boolean; };

export type IssuanceFormState = { issuance_date: string; category: string; issued_to: string; truck_id: string; company_equipment_id: string; reference_no: string; liters: string; remarks: string; };

export type AdjustmentFormState = { movement_date: string; liters_delta: string; unit_cost: string; reference_no: string; description: string; is_opening_balance: boolean; };

export type FuelReversals = { reversedLedgerIds: Set<string>; reversedSourceIds: Set<string>; };
