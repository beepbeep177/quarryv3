import {
  Loader2,
  Wrench
} from 'lucide-react';
import type { CompanyEquipment, FuelBranch } from '../../lib/database.types';
import Pagination from '../Pagination';
import { EquipmentTable, Field } from './FuelTables';
import { PAGE_SIZE, equipmentTypes, inputClass } from './fuelUtils';
import type { EquipmentFormState, FuelTab } from './types';

interface FuelEquipmentProps {
  activeTab: FuelTab;
  canManageEquipment: boolean;
  handleEquipmentSubmit: (e: React.FormEvent) => Promise<void>;
  equipmentForm: EquipmentFormState;
  setEquipmentForm: React.Dispatch<React.SetStateAction<EquipmentFormState>>;
  branches: FuelBranch[];
  equipmentSaving: boolean;
  pagedEquipment: CompanyEquipment[];
  editingEquipment: CompanyEquipment | null;
  editEquipmentForm: EquipmentFormState;
  setEditEquipmentForm: React.Dispatch<React.SetStateAction<EquipmentFormState>>;
  startEquipmentEdit: (item: CompanyEquipment) => void;
  setEditingEquipment: React.Dispatch<React.SetStateAction<CompanyEquipment | null>>;
  handleEquipmentEditSubmit: (e: React.FormEvent) => Promise<void>;
  deactivateEquipment: (item: CompanyEquipment) => void;
  equipmentCurrentPage: number;
  visibleCompanyEquipment: CompanyEquipment[];
  setEquipmentPage: React.Dispatch<React.SetStateAction<number>>;
}

export default function FuelEquipment({
  activeTab,
  canManageEquipment,
  handleEquipmentSubmit,
  equipmentForm,
  setEquipmentForm,
  branches,
  equipmentSaving,
  pagedEquipment,
  editingEquipment,
  editEquipmentForm,
  setEditEquipmentForm,
  startEquipmentEdit,
  setEditingEquipment,
  handleEquipmentEditSubmit,
  deactivateEquipment,
  equipmentCurrentPage,
  visibleCompanyEquipment,
  setEquipmentPage
}: FuelEquipmentProps) {
  return (<>
    {activeTab === 'equipment' && (
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {canManageEquipment && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 h-fit">
            <h2 className="font-semibold text-slate-800 mb-4">Add Company Equipment</h2>
            <form onSubmit={handleEquipmentSubmit} className="space-y-4">
              <Field label="Branch / Company">
                <select value={equipmentForm.branch_id} onChange={e => setEquipmentForm(f => ({ ...f, branch_id: e.target.value }))} className={inputClass}>
                  <option value="">All branches</option>
                  {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.company_name} - {branch.name}</option>)}
                </select>
              </Field>
              <Field label="Equipment Name"><input required value={equipmentForm.name} onChange={e => setEquipmentForm(f => ({ ...f, name: e.target.value }))} className={inputClass} placeholder="Loader WA380" /></Field>
              <Field label="Type">
                <select value={equipmentForm.equipment_type} onChange={e => setEquipmentForm(f => ({ ...f, equipment_type: e.target.value }))} className={inputClass}>
                  {equipmentTypes.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </Field>
              <Field label="Code / Plate"><input value={equipmentForm.plate_or_code} onChange={e => setEquipmentForm(f => ({ ...f, plate_or_code: e.target.value }))} className={inputClass} placeholder="WA380" /></Field>
              <Field label="Operator"><input value={equipmentForm.operator_name} onChange={e => setEquipmentForm(f => ({ ...f, operator_name: e.target.value }))} className={inputClass} placeholder="Operator name" /></Field>
              <Field label="Notes"><textarea value={equipmentForm.notes} onChange={e => setEquipmentForm(f => ({ ...f, notes: e.target.value }))} className={`${inputClass} resize-none`} rows={2} /></Field>
              <button disabled={equipmentSaving} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold disabled:opacity-70">
                {equipmentSaving ? <Loader2 size={15} className="animate-spin" /> : <Wrench size={15} />}
                Save Equipment
              </button>
            </form>
          </div>
        )}
        <div className={canManageEquipment ? 'xl:col-span-2' : 'xl:col-span-3'}>
          <EquipmentTable
            rows={pagedEquipment}
            branches={branches}
            canManage={canManageEquipment}
            editingEquipment={editingEquipment}
            editForm={editEquipmentForm}
            setEditForm={setEditEquipmentForm}
            onStartEdit={startEquipmentEdit}
            onCancelEdit={() => setEditingEquipment(null)}
            onSubmitEdit={handleEquipmentEditSubmit}
            onDeactivate={deactivateEquipment}
            saving={equipmentSaving}
          />
          <Pagination page={equipmentCurrentPage} pageSize={PAGE_SIZE} totalItems={visibleCompanyEquipment.length} onPageChange={setEquipmentPage} />
        </div>
      </div>
    )}
  </>);
}
