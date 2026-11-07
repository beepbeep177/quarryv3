import {
  ClipboardList,
  Loader2,
  Pencil
} from 'lucide-react';
import type { CompanyEquipment, Truck as TruckType } from '../../lib/database.types';
import Pagination from '../Pagination';
import { Field, FormGuide, IssuancesTable } from './FuelTables';
import { PAGE_SIZE, REMARK_REQUIRED_AFTER_DAYS, currency, fmt, formatDate, formatEquipmentTarget, inputClass, issueCategories } from './fuelUtils';
import type { FuelIssuanceWithTarget, FuelReversals, FuelTab, IssuanceFormState } from './types';

interface FuelIssuancesProps {
  activeTab: FuelTab;
  canIssue: boolean;
  editingIssuance: FuelIssuanceWithTarget | null;
  handleIssuanceSubmit: (e: React.FormEvent) => void;
  issuanceForm: IssuanceFormState;
  setIssuanceForm: React.Dispatch<React.SetStateAction<IssuanceFormState>>;
  handleIssuanceCategoryChange: (category: string) => void;
  isHaulerOffsetIssue: boolean;
  handleTruckPick: (truckId: string, source: "hauler" | "company") => void;
  haulerTrucks: TruckType[];
  isCompanyTruckIssue: boolean;
  companyTrucks: TruckType[];
  isCompanyEquipmentIssue: boolean;
  handleEquipmentPick: (equipmentId: string) => void;
  availableCompanyEquipment: CompanyEquipment[];
  usesStructuredIssuanceTarget: boolean;
  saving: boolean;
  cancelEditIssuance: () => void;
  pagedIssuances: FuelIssuanceWithTarget[];
  reversal: FuelReversals;
  canEditIssuance: boolean;
  startEditIssuance: (item: FuelIssuanceWithTarget) => void;
  issuanceCurrentPage: number;
  filteredIssuances: FuelIssuanceWithTarget[];
  setIssuancePage: React.Dispatch<React.SetStateAction<number>>;
}

export default function FuelIssuances({
  activeTab,
  canIssue,
  editingIssuance,
  handleIssuanceSubmit,
  issuanceForm,
  setIssuanceForm,
  handleIssuanceCategoryChange,
  isHaulerOffsetIssue,
  handleTruckPick,
  haulerTrucks,
  isCompanyTruckIssue,
  companyTrucks,
  isCompanyEquipmentIssue,
  handleEquipmentPick,
  availableCompanyEquipment,
  usesStructuredIssuanceTarget,
  saving,
  cancelEditIssuance,
  pagedIssuances,
  reversal,
  canEditIssuance,
  startEditIssuance,
  issuanceCurrentPage,
  filteredIssuances,
  setIssuancePage
}: FuelIssuancesProps) {
  return (<>
    {activeTab === 'issuances' && (
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {(canIssue || editingIssuance) && (
          <div className={`bg-white rounded-xl border p-5 h-fit ${editingIssuance ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-200'}`}>
            <h2 className="font-semibold text-slate-800 mb-4">{editingIssuance ? 'Edit Fuel Issuance' : 'Issue Fuel'}</h2>
            {editingIssuance && (
              <p className="-mt-2 mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Editing issuance to {editingIssuance.issued_to} ({fmt(Number(editingIssuance.liters))} L) from {formatDate(editingIssuance.issuance_date)}. Its cost stays at {currency(Number(editingIssuance.unit_cost_snapshot))}/L.
              </p>
            )}
            <FormGuide tips={[
              'Issuances use the current stock and average cost, even when backdated.',
              'Encode the purchase first if the fuel came from a delivery not yet recorded.',
              `Entries older than ${REMARK_REQUIRED_AFTER_DAYS} days need a remark (e.g. "from logbook").`,
            ]} />
            <form onSubmit={handleIssuanceSubmit} className="space-y-4">
              <Field label="Date"><input required type="date" value={issuanceForm.issuance_date} onChange={e => setIssuanceForm(f => ({ ...f, issuance_date: e.target.value }))} className={inputClass} /></Field>
              <Field label="Category">
                <select value={issuanceForm.category} onChange={e => handleIssuanceCategoryChange(e.target.value)} className={inputClass}>
                  {issueCategories.map(category => <option key={category} value={category}>{category}</option>)}
                </select>
              </Field>
              {isHaulerOffsetIssue && (
                <Field label="Hauler Truck">
                  <select required value={issuanceForm.truck_id} onChange={e => handleTruckPick(e.target.value, 'hauler')} className={inputClass}>
                    <option value="">Select hauler truck...</option>
                    {haulerTrucks.map(truck => <option key={truck.id} value={truck.id}>{truck.plate_number} - {truck.driver_name || 'No driver'}</option>)}
                  </select>
                </Field>
              )}
              {isCompanyTruckIssue && (
                <Field label="Company Truck">
                  <select required value={issuanceForm.truck_id} onChange={e => handleTruckPick(e.target.value, 'company')} className={inputClass}>
                    <option value="">Select company truck...</option>
                    {companyTrucks.map(truck => <option key={truck.id} value={truck.id}>{truck.plate_number} - {truck.driver_name || 'No driver'}</option>)}
                  </select>
                </Field>
              )}
              {isCompanyEquipmentIssue && (
                <Field label="Company Equipment">
                  <select required value={issuanceForm.company_equipment_id} onChange={e => handleEquipmentPick(e.target.value)} className={inputClass}>
                    <option value="">{availableCompanyEquipment.length === 0 ? 'No equipment available' : 'Select equipment...'}</option>
                    {availableCompanyEquipment.map(equipment => (
                      <option key={equipment.id} value={equipment.id}>
                        {equipment.equipment_type} - {formatEquipmentTarget(equipment)}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Issued To">
                <input
                  required
                  value={issuanceForm.issued_to}
                  readOnly={usesStructuredIssuanceTarget}
                  onChange={e => setIssuanceForm(f => ({ ...f, issued_to: e.target.value }))}
                  className={`${inputClass} ${usesStructuredIssuanceTarget ? 'bg-slate-50 text-slate-500' : ''}`}
                  placeholder={usesStructuredIssuanceTarget ? 'Auto-filled from selected target' : 'Javi / Site Errand'}
                />
              </Field>
              <Field label="Reference"><input value={issuanceForm.reference_no} onChange={e => setIssuanceForm(f => ({ ...f, reference_no: e.target.value }))} className={inputClass} placeholder="FI-2026-0702-015" /></Field>
              <Field label="Liters"><input required type="number" min="0.01" step="0.01" value={issuanceForm.liters} onChange={e => setIssuanceForm(f => ({ ...f, liters: e.target.value }))} className={inputClass} /></Field>
              <Field label="Remarks"><textarea value={issuanceForm.remarks} onChange={e => setIssuanceForm(f => ({ ...f, remarks: e.target.value }))} className={`${inputClass} resize-none`} rows={2} /></Field>
              <button disabled={saving} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold disabled:opacity-70">
                {saving ? <Loader2 size={15} className="animate-spin" /> : editingIssuance ? <Pencil size={15} /> : <ClipboardList size={15} />}
                {editingIssuance ? 'Update Issuance' : 'Issue Fuel'}
              </button>
              {editingIssuance && (
                <button type="button" onClick={cancelEditIssuance} disabled={saving} className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-70">
                  Cancel Edit
                </button>
              )}
            </form>
          </div>
        )}
        <div className={canIssue || editingIssuance ? 'xl:col-span-2' : 'xl:col-span-3'}>
          <IssuancesTable rows={pagedIssuances} reversedIds={reversal.reversedSourceIds} canEdit={canEditIssuance} editingId={editingIssuance?.id} onEdit={startEditIssuance} />
          <Pagination page={issuanceCurrentPage} pageSize={PAGE_SIZE} totalItems={filteredIssuances.length} onPageChange={setIssuancePage} />
        </div>
      </div>
    )}
  </>);
}
