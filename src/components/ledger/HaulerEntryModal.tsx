import {
  Plus,
  X
} from 'lucide-react';
import type { Customer } from '../../lib/database.types';
import { Field } from './LedgerComponents';
import { currency, fmt, inputClass } from './ledgerUtils';
import type { EntryForm, EntrySide, HaulerTruck, HaulingLineItem, ManualType } from './types';

interface HaulerEntryModalProps {
  showAddModal: boolean;
  saveManualEntry: (event: React.FormEvent) => Promise<void>;
  selectedHauler: Customer | null;
  setShowAddModal: React.Dispatch<React.SetStateAction<boolean>>;
  setFormError: React.Dispatch<React.SetStateAction<string>>;
  formError: string;
  form: EntryForm;
  setFormValue: <K extends keyof EntryForm>(key: K, value: EntryForm[K]) => void;
  manualTypeOptions: ({ value: "HAULING_SERVICE"; label: string; } | { value: "CASH_PAYMENT"; label: string; } | { value: "OPENING_BALANCE"; label: string; } | { value: "ADJUSTMENT"; label: string; })[];
  addHaulingLineItem: () => void;
  selectedHaulerTrucks: HaulerTruck[];
  setHaulingLineTruck: (lineId: string, truckId: string) => void;
  updateHaulingLineItem: (id: string, changes: Partial<HaulingLineItem>) => void;
  removeHaulingLineItem: (id: string) => void;
  haulingLineTotals: { rows: { tripsValue: number; rateValue: number; amount: number; id: string; truck_id: string; truck_plate: string; driver_name: string; trips: string; rate_per_trip: string; }[]; trips: number; amount: number; truckCount: number; };
  haulingServiceAmount: number;
  saving: boolean;
}

export default function HaulerEntryModal({
  showAddModal,
  saveManualEntry,
  selectedHauler,
  setShowAddModal,
  setFormError,
  formError,
  form,
  setFormValue,
  manualTypeOptions,
  addHaulingLineItem,
  selectedHaulerTrucks,
  setHaulingLineTruck,
  updateHaulingLineItem,
  removeHaulingLineItem,
  haulingLineTotals,
  haulingServiceAmount,
  saving
}: HaulerEntryModalProps) {
  return (<>
    {showAddModal && (
      <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <form onSubmit={saveManualEntry} className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Add Hauler Transaction</h2>
              <p className="text-xs text-slate-500 mt-1">{selectedHauler?.name}</p>
            </div>
            <button type="button" onClick={() => { setShowAddModal(false); setFormError(''); }} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
          </div>

          <div className="p-6 space-y-5">
            {formError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Transaction Type">
                <select value={form.transaction_type} onChange={e => setFormValue('transaction_type', e.target.value as ManualType)} className={inputClass}>
                  {manualTypeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
              <Field label="Date">
                <input required type="date" value={form.transaction_date} onChange={e => setFormValue('transaction_date', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Reference">
                <input value={form.reference_no} onChange={e => setFormValue('reference_no', e.target.value)} className={inputClass} placeholder="TRP-2026-0701-001" />
              </Field>
              {form.transaction_type !== 'HAULING_SERVICE' && (
                <Field label="Amount">
                  <input required type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setFormValue('amount', e.target.value)} className={inputClass} />
                </Field>
              )}
              {(form.transaction_type === 'OPENING_BALANCE' || form.transaction_type === 'ADJUSTMENT') && (
                <Field label="Entry Side">
                  <select value={form.entry_side} onChange={e => setFormValue('entry_side', e.target.value as EntrySide)} className={inputClass}>
                    <option value="CREDIT">Credit (+ company owes hauler)</option>
                    <option value="DEBIT">Debit (- hauler owes / offset)</option>
                  </select>
                </Field>
              )}
              <Field label="Description">
                <input value={form.description} onChange={e => setFormValue('description', e.target.value)} className={inputClass} placeholder={form.transaction_type === 'HAULING_SERVICE' ? 'Auto-generated if blank' : 'Short transaction description'} />
              </Field>
            </div>

            {form.transaction_type === 'HAULING_SERVICE' && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="text-xs font-bold uppercase text-slate-500">Hauling Details</p>
                    <p className="text-xs text-slate-400 mt-0.5">Add one row per assigned truck. Amount is trips multiplied by rate.</p>
                  </div>
                  <button
                    type="button"
                    onClick={addHaulingLineItem}
                    disabled={selectedHaulerTrucks.length === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Plus size={14} /> Add Truck
                  </button>
                </div>

                {selectedHaulerTrucks.length === 0 && (
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    No trucks are assigned to this hauler yet. Assign hauler trucks in Logistics first.
                  </div>
                )}

                <div className="space-y-3">
                  {form.hauling_items.map((item, index) => {
                    const lineAmount = (Number(item.trips) || 0) * (Number(item.rate_per_trip) || 0);
                    return (
                      <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_0.7fr_0.9fr_1fr_auto] gap-3 items-end">
                          <Field label={`Truck / Plate ${index + 1}`}>
                            <select value={item.truck_id} onChange={e => setHaulingLineTruck(item.id, e.target.value)} className={inputClass}>
                              <option value="">
                                {selectedHaulerTrucks.length === 0 ? 'No assigned hauler trucks' : 'Select truck...'}
                              </option>
                              {selectedHaulerTrucks.map(truck => (
                                <option key={truck.id} value={truck.id}>
                                  {truck.plate_number}{truck.driver_name ? ` - ${truck.driver_name}` : ''}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Driver">
                            <input value={item.driver_name} readOnly className={`${inputClass} bg-slate-100 text-slate-500`} />
                          </Field>
                          <Field label="Trips">
                            <input required type="number" min="0.01" step="0.01" value={item.trips} onChange={e => updateHaulingLineItem(item.id, { trips: e.target.value })} className={inputClass} />
                          </Field>
                          <Field label="Rate / Trip">
                            <input required type="number" min="0.01" step="0.01" value={item.rate_per_trip} onChange={e => updateHaulingLineItem(item.id, { rate_per_trip: e.target.value })} className={inputClass} />
                          </Field>
                          <Field label="Amount">
                            <div className="w-full px-3 py-2.5 rounded-lg border border-emerald-200 text-sm font-bold text-emerald-700 bg-emerald-50 tabular-nums">
                              {currency(lineAmount)}
                            </div>
                          </Field>
                          <button
                            type="button"
                            onClick={() => removeHaulingLineItem(item.id)}
                            disabled={form.hauling_items.length === 1}
                            className="h-10 w-10 rounded-lg border border-slate-200 text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30"
                            title="Remove truck row"
                          >
                            <X size={16} className="mx-auto" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <p className="text-xs font-semibold text-slate-500">Total Trips</p>
                    <p className="text-sm font-bold text-slate-800 tabular-nums">{fmt(haulingLineTotals.trips).replace('.00', '')}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <p className="text-xs font-semibold text-slate-500">Trucks Used</p>
                    <p className="text-sm font-bold text-slate-800 tabular-nums">{haulingLineTotals.truckCount}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                    <p className="text-xs font-semibold text-emerald-700">Total Amount</p>
                    <p className="text-sm font-bold text-emerald-700 tabular-nums">{currency(haulingServiceAmount)}</p>
                  </div>
                </div>
              </div>
            )}

            {form.transaction_type === 'CASH_PAYMENT' && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-xs font-bold uppercase text-slate-500 mb-3">Payment Details</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Payment Method"><input value={form.payment_method} onChange={e => setFormValue('payment_method', e.target.value)} className={inputClass} placeholder="Cash / Check / Bank Transfer" /></Field>
                  <Field label="Check / Reference No."><input value={form.payment_reference} onChange={e => setFormValue('payment_reference', e.target.value)} className={inputClass} /></Field>
                </div>
              </div>
            )}

            {(form.transaction_type === 'OPENING_BALANCE' || form.transaction_type === 'ADJUSTMENT') && (
              <Field label="Reason">
                <input value={form.reason} onChange={e => setFormValue('reason', e.target.value)} className={inputClass} placeholder="Why this balance/adjustment is needed" />
              </Field>
            )}

            <Field label="Remarks">
              <textarea value={form.remarks} onChange={e => setFormValue('remarks', e.target.value)} className={`${inputClass} min-h-[90px]`} />
            </Field>
          </div>

          <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
            <button type="button" onClick={() => { setShowAddModal(false); setFormError(''); }} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60">
              {saving ? 'Saving...' : 'Save Transaction'}
            </button>
          </div>
        </form>
      </div>
    )}
  </>);
}
