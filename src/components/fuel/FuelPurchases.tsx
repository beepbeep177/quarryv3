import {
  Loader2,
  Pencil,
  Plus
} from 'lucide-react';
import type { FuelPurchase } from '../../lib/database.types';
import Pagination from '../Pagination';
import { Field, FormGuide, PurchasesTable } from './FuelTables';
import { PAGE_SIZE, REMARK_REQUIRED_AFTER_DAYS, formatDate, inputClass } from './fuelUtils';
import type { FuelReversals, FuelTab, PurchaseFormState } from './types';

interface FuelPurchasesProps {
  activeTab: FuelTab;
  canAddPurchase: boolean;
  editingPurchase: FuelPurchase | null;
  handlePurchaseSubmit: (e: React.FormEvent) => void;
  purchaseForm: PurchaseFormState;
  setPurchaseForm: React.Dispatch<React.SetStateAction<PurchaseFormState>>;
  saving: boolean;
  cancelEditPurchase: () => void;
  pagedPurchases: FuelPurchase[];
  reversal: FuelReversals;
  postPurchaseToExpenses: (purchase: FuelPurchase) => Promise<void>;
  canEditPurchase: boolean;
  startEditPurchase: (item: FuelPurchase) => void;
  purchaseCurrentPage: number;
  filteredPurchases: FuelPurchase[];
  setPurchasePage: React.Dispatch<React.SetStateAction<number>>;
}

export default function FuelPurchases({
  activeTab,
  canAddPurchase,
  editingPurchase,
  handlePurchaseSubmit,
  purchaseForm,
  setPurchaseForm,
  saving,
  cancelEditPurchase,
  pagedPurchases,
  reversal,
  postPurchaseToExpenses,
  canEditPurchase,
  startEditPurchase,
  purchaseCurrentPage,
  filteredPurchases,
  setPurchasePage
}: FuelPurchasesProps) {
  return (<>
    {activeTab === 'purchases' && (
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {(canAddPurchase || editingPurchase) && (
          <div className={`bg-white rounded-xl border p-5 h-fit ${editingPurchase ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-200'}`}>
            <h2 className="font-semibold text-slate-800 mb-4">{editingPurchase ? 'Edit Fuel Purchase' : 'Add Fuel Purchase'}</h2>
            {editingPurchase && (
              <p className="-mt-2 mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Editing {editingPurchase.supplier} {editingPurchase.reference_no ? `(${editingPurchase.reference_no}) ` : ''}from {formatDate(editingPurchase.purchase_date)}. Inventory and the ledger are corrected automatically.
              </p>
            )}
            <FormGuide tips={[
              'Price / L is per liter (e.g. 92.70), not the receipt total.',
              'Encode purchases before the issuances that used them, so stock and cost stay correct.',
              `Entries older than ${REMARK_REQUIRED_AFTER_DAYS} days need a remark.`,
              'Wrong entry? Reverse it in Inventory Ledger and tick "Re-encode" to fix it.',
            ]} />
            <form onSubmit={handlePurchaseSubmit} className="space-y-4">
              <Field label="Date"><input required type="date" value={purchaseForm.purchase_date} onChange={e => setPurchaseForm(f => ({ ...f, purchase_date: e.target.value }))} className={inputClass} /></Field>
              <Field label="Supplier"><input required value={purchaseForm.supplier} onChange={e => setPurchaseForm(f => ({ ...f, supplier: e.target.value }))} className={inputClass} placeholder="RTM Gas Station" /></Field>
              <Field label="Reference"><input value={purchaseForm.reference_no} onChange={e => setPurchaseForm(f => ({ ...f, reference_no: e.target.value }))} className={inputClass} placeholder="PO-2026-0701-001" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Liters"><input required type="number" min="0.01" step="0.01" value={purchaseForm.liters} onChange={e => setPurchaseForm(f => ({ ...f, liters: e.target.value }))} className={inputClass} /></Field>
                <Field label="Price / L"><input required type="number" min="0" step="0.01" value={purchaseForm.unit_cost} onChange={e => setPurchaseForm(f => ({ ...f, unit_cost: e.target.value }))} className={inputClass} /></Field>
              </div>
              {editingPurchase ? (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                  {editingPurchase.expense_id
                    ? 'The linked Diesel expense will be updated to the new amount and date.'
                    : 'Not posted to Expenses. Use "Post to Expenses" in the table after saving if needed.'}
                </p>
              ) : (
                <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                  <input type="checkbox" checked={purchaseForm.post_to_expenses} onChange={e => setPurchaseForm(f => ({ ...f, post_to_expenses: e.target.checked }))} className="mt-0.5 h-4 w-4 accent-emerald-500" />
                  <span><span className="block font-semibold">Post to Expenses</span><span className="block text-xs text-slate-500">Creates the linked Diesel expense once.</span></span>
                </label>
              )}
              <Field label="Remarks"><textarea value={purchaseForm.remarks} onChange={e => setPurchaseForm(f => ({ ...f, remarks: e.target.value }))} className={`${inputClass} resize-none`} rows={2} /></Field>
              <button disabled={saving} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold disabled:opacity-70">
                {saving ? <Loader2 size={15} className="animate-spin" /> : editingPurchase ? <Pencil size={15} /> : <Plus size={15} />}
                {editingPurchase ? 'Update Purchase' : 'Save Purchase'}
              </button>
              {editingPurchase && (
                <button type="button" onClick={cancelEditPurchase} disabled={saving} className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-70">
                  Cancel Edit
                </button>
              )}
            </form>
          </div>
        )}
        <div className={canAddPurchase || editingPurchase ? 'xl:col-span-2' : 'xl:col-span-3'}>
          <PurchasesTable rows={pagedPurchases} reversedIds={reversal.reversedSourceIds} canPost={canAddPurchase} saving={saving} onPost={postPurchaseToExpenses} canEdit={canEditPurchase} editingId={editingPurchase?.id} onEdit={startEditPurchase} />
          <Pagination page={purchaseCurrentPage} pageSize={PAGE_SIZE} totalItems={filteredPurchases.length} onPageChange={setPurchasePage} />
        </div>
      </div>
    )}
  </>);
}
