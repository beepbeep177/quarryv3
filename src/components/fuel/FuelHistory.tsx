import {
  History,
  Info,
  Loader2
} from 'lucide-react';
import type { FuelInventoryLedger } from '../../lib/database.types';
import Pagination from '../Pagination';
import { Field, FormGuide, HistoryTable } from './FuelTables';
import { PAGE_SIZE, inputClass } from './fuelUtils';
import type { AdjustmentFormState, FuelReversals, FuelTab } from './types';

interface FuelHistoryProps {
  activeTab: FuelTab;
  canAdjust: boolean;
  handleAdjustmentSubmit: (e: React.FormEvent) => void;
  adjustmentForm: AdjustmentFormState;
  setAdjustmentForm: React.Dispatch<React.SetStateAction<AdjustmentFormState>>;
  saving: boolean;
  backdatedLedgerCount: number;
  setLedgerOrder: React.Dispatch<React.SetStateAction<"date" | "encoded">>;
  ledgerOrder: "date" | "encoded";
  pagedLedger: FuelInventoryLedger[];
  reversal: FuelReversals;
  reverseMovement: (item: FuelInventoryLedger) => void;
  historyCurrentPage: number;
  filteredLedger: FuelInventoryLedger[];
  setHistoryPage: React.Dispatch<React.SetStateAction<number>>;
}

export default function FuelHistory({
  activeTab,
  canAdjust,
  handleAdjustmentSubmit,
  adjustmentForm,
  setAdjustmentForm,
  saving,
  backdatedLedgerCount,
  setLedgerOrder,
  ledgerOrder,
  pagedLedger,
  reversal,
  reverseMovement,
  historyCurrentPage,
  filteredLedger,
  setHistoryPage
}: FuelHistoryProps) {
  return (<>
    {activeTab === 'history' && (
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {canAdjust && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 h-fit">
            <h2 className="font-semibold text-slate-800 mb-4">Inventory Adjustment</h2>
            <FormGuide tips={[
              'Use only for physical count differences. Negative liters = deduction.',
              'To fix a wrong purchase or issuance, use Reverse in the table instead.',
            ]} />
            <form onSubmit={handleAdjustmentSubmit} className="space-y-4">
              <Field label="Date"><input required type="date" value={adjustmentForm.movement_date} onChange={e => setAdjustmentForm(f => ({ ...f, movement_date: e.target.value }))} className={inputClass} /></Field>
              <Field label="Liters Delta"><input required type="number" step="0.01" value={adjustmentForm.liters_delta} onChange={e => setAdjustmentForm(f => ({ ...f, liters_delta: e.target.value }))} className={inputClass} placeholder="Use negative for deduction" /></Field>
              <Field label="Unit Cost"><input required type="number" min="0" step="0.01" value={adjustmentForm.unit_cost} onChange={e => setAdjustmentForm(f => ({ ...f, unit_cost: e.target.value }))} className={inputClass} /></Field>
              <Field label="Reference"><input value={adjustmentForm.reference_no} onChange={e => setAdjustmentForm(f => ({ ...f, reference_no: e.target.value }))} className={inputClass} /></Field>
              <Field label="Description"><textarea value={adjustmentForm.description} onChange={e => setAdjustmentForm(f => ({ ...f, description: e.target.value }))} className={`${inputClass} resize-none`} rows={2} /></Field>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={adjustmentForm.is_opening_balance} onChange={e => setAdjustmentForm(f => ({ ...f, is_opening_balance: e.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-200" />
                Opening balance
              </label>
              <button disabled={saving} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold disabled:opacity-70">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <History size={15} />}
                Save Movement
              </button>
            </form>
          </div>
        )}
        <div className={canAdjust ? 'xl:col-span-2' : 'xl:col-span-3'}>
          <div className="mb-3 flex flex-col gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-2.5">
              <Info size={16} className="mt-0.5 shrink-0 text-sky-600" />
              <div>
                <p className="font-semibold">How to read the Balance column</p>
                <p className="mt-0.5 text-sky-800">
                  Balance is the inventory right after each entry was <span className="font-semibold">encoded</span>, not after its transaction date.
                  {backdatedLedgerCount > 0 && (
                    <> <span className="font-semibold text-amber-700">{backdatedLedgerCount} {backdatedLedgerCount === 1 ? 'entry was' : 'entries were'} encoded later than its transaction date</span> (marked in orange), so sorting by transaction date can make the balance look like it jumped.</>
                  )}
                  {' '}Use <span className="font-semibold">Encoded order</span> to follow the actual step-by-step balance.
                </p>
              </div>
            </div>
            <div className="inline-flex shrink-0 self-start rounded-lg border border-sky-200 bg-white p-0.5 text-xs font-semibold">
              <button type="button" onClick={() => setLedgerOrder('encoded')} className={`rounded-md px-3 py-1.5 ${ledgerOrder === 'encoded' ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Encoded order</button>
              <button type="button" onClick={() => setLedgerOrder('date')} className={`rounded-md px-3 py-1.5 ${ledgerOrder === 'date' ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Transaction date</button>
            </div>
          </div>
          <HistoryTable rows={pagedLedger} reversedLedgerIds={reversal.reversedLedgerIds} showEncoded={ledgerOrder === 'encoded'} canAdjust={canAdjust} onReverse={reverseMovement} saving={saving} />
          <Pagination page={historyCurrentPage} pageSize={PAGE_SIZE} totalItems={filteredLedger.length} onPageChange={setHistoryPage} />
        </div>
      </div>
    )}
  </>);
}
