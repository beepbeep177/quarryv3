import {
  X
} from 'lucide-react';
import type { Customer } from '../../lib/database.types';
import { Field } from './LedgerComponents';
import { currency, inputClass } from './ledgerUtils';
import type { CustomerCreditForm, CustomerCreditManualType, EntrySide } from './types';

interface CustomerCreditModalProps {
  showCustomerCreditModal: boolean;
  selectedCustomer: Customer | null;
  saveCustomerCreditEntry: (event: React.FormEvent) => Promise<void>;
  setShowCustomerCreditModal: React.Dispatch<React.SetStateAction<boolean>>;
  setFormError: React.Dispatch<React.SetStateAction<string>>;
  formError: string;
  customerAvailableCredit: number;
  customerCreditForm: CustomerCreditForm;
  setCustomerCreditFormValue: <K extends keyof CustomerCreditForm>(key: K, value: CustomerCreditForm[K]) => void;
  customerCreditTypeOptions: ({ value: "ADVANCE_PAYMENT"; label: string; } | { value: "OPENING_BALANCE"; label: string; } | { value: "ADJUSTMENT"; label: string; })[];
  saving: boolean;
}

export default function CustomerCreditModal({
  showCustomerCreditModal,
  selectedCustomer,
  saveCustomerCreditEntry,
  setShowCustomerCreditModal,
  setFormError,
  formError,
  customerAvailableCredit,
  customerCreditForm,
  setCustomerCreditFormValue,
  customerCreditTypeOptions,
  saving
}: CustomerCreditModalProps) {
  return (<>
    {showCustomerCreditModal && selectedCustomer && (
      <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <form onSubmit={saveCustomerCreditEntry} className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Add Customer Credit</h2>
              <p className="text-xs text-slate-500 mt-1">{selectedCustomer.name}</p>
            </div>
            <button type="button" onClick={() => { setShowCustomerCreditModal(false); setFormError(''); }} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
          </div>

          <div className="p-6 space-y-5">
            {formError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {formError}
              </div>
            )}

            <div className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3">
              <p className="text-xs font-semibold text-teal-700 uppercase">Current Credit Balance</p>
              <p className={`text-2xl font-bold tabular-nums mt-1 ${customerAvailableCredit < 0 ? 'text-red-600' : 'text-teal-800'}`}>{currency(customerAvailableCredit)}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Entry Type">
                <select value={customerCreditForm.transaction_type} onChange={e => setCustomerCreditFormValue('transaction_type', e.target.value as CustomerCreditManualType)} className={inputClass}>
                  {customerCreditTypeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
              <Field label="Date">
                <input required type="date" value={customerCreditForm.transaction_date} onChange={e => setCustomerCreditFormValue('transaction_date', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Reference">
                <input value={customerCreditForm.reference_no} onChange={e => setCustomerCreditFormValue('reference_no', e.target.value)} className={inputClass} placeholder="OR / Receipt / Ref no." />
              </Field>
              <Field label="Amount">
                <input required type="number" min="0.01" step="0.01" value={customerCreditForm.amount} onChange={e => setCustomerCreditFormValue('amount', e.target.value)} className={inputClass} />
              </Field>
              {(customerCreditForm.transaction_type === 'OPENING_BALANCE' || customerCreditForm.transaction_type === 'ADJUSTMENT') && (
                <Field label="Entry Side">
                  <select value={customerCreditForm.entry_side} onChange={e => setCustomerCreditFormValue('entry_side', e.target.value as EntrySide)} className={inputClass}>
                    <option value="CREDIT">Credit (+ add to customer balance)</option>
                    <option value="DEBIT">Debit (- reduce customer balance)</option>
                  </select>
                </Field>
              )}
              <Field label="Description">
                <input value={customerCreditForm.description} onChange={e => setCustomerCreditFormValue('description', e.target.value)} className={inputClass} placeholder="Short description" />
              </Field>
            </div>

            <Field label="Remarks">
              <textarea value={customerCreditForm.remarks} onChange={e => setCustomerCreditFormValue('remarks', e.target.value)} className={`${inputClass} min-h-[90px]`} />
            </Field>
          </div>

          <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
            <button type="button" onClick={() => { setShowCustomerCreditModal(false); setFormError(''); }} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60">
              {saving ? 'Saving...' : 'Save Credit Entry'}
            </button>
          </div>
        </form>
      </div>
    )}
  </>);
}
