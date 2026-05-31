import { useEffect, useState, useCallback } from 'react';
import { X, Calculator, Loader2, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Customer, Truck, Pricing, PaymentMode, TransactionStatus, TransactionWithRelations } from '../lib/database.types';

interface AddEntryModalProps {
  onClose: () => void;
  onSuccess: () => void;
  transaction?: TransactionWithRelations;
}

interface FormData {
  customer_id: string;
  truck_id: string;
  dr_number: string;
  transaction_date: string;
  length_cm: string;
  width_cm: string;
  height_cm: string;
  unit_price: string;
  dr_capitol: string;
  passway: string;
  kulot: string;
  payment_mode: PaymentMode;
  status: TransactionStatus;
  notes: string;
}

const todayDate = new Date().toISOString().split('T')[0];

const EMPTY_FORM: FormData = {
  customer_id: '',
  truck_id: '',
  dr_number: '',
  transaction_date: todayDate,
  length_cm: '',
  width_cm: '',
  height_cm: '',
  unit_price: '',
  dr_capitol: '0',
  passway: '0',
  kulot: '0',
  payment_mode: 'CASH',
  status: 'PAID',
  notes: '',
};

function txToForm(tx: TransactionWithRelations): FormData {
  return {
    customer_id: tx.customer_id,
    truck_id: tx.truck_id,
    dr_number: tx.dr_number,
    transaction_date: tx.transaction_date,
    length_cm: String(tx.length_cm),
    width_cm: String(tx.width_cm),
    height_cm: String(tx.height_cm),
    unit_price: String(tx.unit_price),
    dr_capitol: String(tx.dr_capitol),
    passway: String(tx.passway),
    kulot: String(tx.kulot),
    payment_mode: tx.payment_mode,
    status: tx.status,
    notes: tx.notes ?? '',
  };
}

export default function AddEntryModal({ onClose, onSuccess, transaction }: AddEntryModalProps) {
  const isEditing = !!transaction;
  const [form, setForm] = useState<FormData>(isEditing ? txToForm(transaction!) : EMPTY_FORM);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [pricingList, setPricingList] = useState<Pricing[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  useEffect(() => {
    Promise.all([
      supabase.from('customers').select('*').order('name'),
      supabase.from('trucks').select('*').order('plate_number'),
      supabase.from('pricing').select('*').order('material_type'),
    ]).then(([c, t, p]) => {
      setCustomers((c.data ?? []) as Customer[]);
      setTrucks((t.data ?? []) as Truck[]);
      setPricingList((p.data ?? []) as Pricing[]);
      if (!isEditing && p.data && p.data.length > 0) {
        setForm(f => ({ ...f, unit_price: String(p.data[0].unit_price) }));
      }
    });
  }, [isEditing]);

  const n = (val: string) => parseFloat(val) || 0;

  const volume = useCallback(() => {
    const l = n(form.length_cm), w = n(form.width_cm), h = n(form.height_cm);
    return (l * w * h) / 1_000_000;
  }, [form.length_cm, form.width_cm, form.height_cm]);

  const amount = useCallback(() => volume() * n(form.unit_price), [volume, form.unit_price]);
  const totalAmount = useCallback(() => amount() + n(form.dr_capitol) + n(form.passway) + n(form.kulot), [amount, form.dr_capitol, form.passway, form.kulot]);

  const set = (key: keyof FormData, val: string) => {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => ({ ...e, [key]: undefined }));
  };

  function validate() {
    const errs: Partial<Record<keyof FormData, string>> = {};
    if (!form.customer_id) errs.customer_id = 'Required';
    if (!form.truck_id) errs.truck_id = 'Required';
    if (!form.dr_number.trim()) errs.dr_number = 'Required';
    if (!form.length_cm || n(form.length_cm) <= 0) errs.length_cm = 'Must be > 0';
    if (!form.width_cm || n(form.width_cm) <= 0) errs.width_cm = 'Must be > 0';
    if (!form.height_cm || n(form.height_cm) <= 0) errs.height_cm = 'Must be > 0';
    if (!form.unit_price || n(form.unit_price) <= 0) errs.unit_price = 'Must be > 0';
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSaving(true);

    const payload = {
      transaction_date: form.transaction_date,
      customer_id: form.customer_id,
      truck_id: form.truck_id,
      dr_number: form.dr_number.trim(),
      length_cm: n(form.length_cm),
      width_cm: n(form.width_cm),
      height_cm: n(form.height_cm),
      unit_price: n(form.unit_price),
      dr_capitol: n(form.dr_capitol),
      passway: n(form.passway),
      kulot: n(form.kulot),
      payment_mode: form.payment_mode,
      status: isEditing ? form.status : (form.payment_mode === 'CASH' ? 'PAID' : 'PENDING') as TransactionStatus,
      notes: form.notes,
    };

    const { error } = isEditing
      ? await supabase.from('transactions').update(payload).eq('id', transaction!.id)
      : await supabase.from('transactions').insert(payload);

    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 900);
    }
  }

  const fmt = (v: number) => v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const paymentModes: PaymentMode[] = ['CASH', 'P.O', 'OFFSET'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{isEditing ? 'Edit Entry' : 'Add Daily Entry'}</h2>
            <p className="text-slate-500 text-xs mt-0.5">{new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Transaction Date (edit mode only) */}
          {isEditing && (
            <Field label="Transaction Date">
              <input
                type="date"
                value={form.transaction_date}
                onChange={e => set('transaction_date', e.target.value)}
                className={inputCls(false)}
              />
            </Field>
          )}
          {/* Customer & Truck */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Customer" error={errors.customer_id}>
              <select value={form.customer_id} onChange={e => set('customer_id', e.target.value)} className={selectCls(!!errors.customer_id)}>
                <option value="">Select customer...</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Truck Plate #" error={errors.truck_id}>
              <select value={form.truck_id} onChange={e => set('truck_id', e.target.value)} className={selectCls(!!errors.truck_id)}>
                <option value="">Select truck...</option>
                {trucks.map(t => <option key={t.id} value={t.id}>{t.plate_number} — {t.driver_name}</option>)}
              </select>
            </Field>
          </div>

          {/* DR Number */}
          <Field label="DR Number" error={errors.dr_number}>
            <input
              type="text"
              placeholder="e.g. DR-2026-001"
              value={form.dr_number}
              onChange={e => set('dr_number', e.target.value)}
              className={inputCls(!!errors.dr_number)}
            />
          </Field>

          {/* Dimensions */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Dimensions (cm)</p>
            <div className="grid grid-cols-3 gap-3">
              {(['length_cm', 'width_cm', 'height_cm'] as const).map((key, i) => (
                <Field key={key} label={['Length (L)', 'Width (W)', 'Height (H)'][i]} error={errors[key]}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={form[key]}
                    onChange={e => set(key, e.target.value)}
                    className={inputCls(!!errors[key])}
                  />
                </Field>
              ))}
            </div>
          </div>

          {/* Auto-Compute Preview */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Calculator size={15} className="text-emerald-500" />
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Auto-Computed Values</span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <ComputedRow label="Volume (m³)" value={`${volume().toFixed(4)} m³`} highlight />
              <ComputedRow label="Unit Price" value={`₱${fmt(n(form.unit_price))}`} />
              <ComputedRow label="Amount" value={`₱${fmt(amount())}`} highlight />
              <ComputedRow label="Total" value={`₱${fmt(totalAmount())}`} />
            </div>
          </div>

          {/* Unit Price */}
          <Field label="Unit Price (₱/m³)" error={errors.unit_price}>
            <div className="flex gap-2 items-start">
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={form.unit_price}
                onChange={e => set('unit_price', e.target.value)}
                className={inputCls(!!errors.unit_price) + ' flex-1'}
              />
              <div className="flex gap-1.5 flex-wrap">
                {pricingList.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => set('unit_price', String(p.unit_price))}
                    className={`px-2.5 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      form.unit_price === String(p.unit_price)
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'border-slate-200 text-slate-600 hover:border-emerald-400 hover:text-emerald-600'
                    }`}
                  >
                    {p.material_type}
                    <span className="ml-1 opacity-75">₱{p.unit_price}</span>
                  </button>
                ))}
              </div>
            </div>
          </Field>

          {/* Extra Fees */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Extra Fees (₱)</p>
            <div className="grid grid-cols-3 gap-3">
              {(['dr_capitol', 'passway', 'kulot'] as const).map((key, i) => (
                <Field key={key} label={['DR Capitol', 'Passway', 'Kulot'][i]}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form[key]}
                    onChange={e => set(key, e.target.value)}
                    className={inputCls(false)}
                  />
                </Field>
              ))}
            </div>
          </div>

          {/* Payment Mode */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Mode of Payment</p>
            <div className="flex gap-2">
              {paymentModes.map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => set('payment_mode', mode)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                    form.payment_mode === mode
                      ? mode === 'CASH'
                        ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm shadow-emerald-200'
                        : mode === 'P.O'
                        ? 'bg-amber-500 border-amber-500 text-white shadow-sm shadow-amber-200'
                        : 'bg-slate-600 border-slate-600 text-white'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300 bg-white'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Status (edit mode only) */}
          {isEditing && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Status</p>
              <div className="flex gap-2">
                {(['PAID', 'PENDING'] as TransactionStatus[]).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => set('status', s)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                      form.status === s
                        ? s === 'PAID'
                          ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm shadow-emerald-200'
                          : 'bg-amber-500 border-amber-500 text-white shadow-sm shadow-amber-200'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300 bg-white'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <Field label="Notes (optional)">
            <textarea
              rows={2}
              placeholder="Additional remarks..."
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              className={inputCls(false) + ' resize-none'}
            />
          </Field>

          {/* Total Summary */}
          <div className="flex items-center justify-between bg-slate-900 rounded-xl px-5 py-4">
            <span className="text-slate-300 text-sm font-medium">Grand Total</span>
            <span className="text-2xl font-bold text-emerald-400">₱{fmt(totalAmount())}</span>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || saved}
              className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-70 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              {saved ? (
                <><CheckCircle size={16} /> {isEditing ? 'Updated!' : 'Saved!'}</>
              ) : saving ? (
                <><Loader2 size={16} className="animate-spin" /> {isEditing ? 'Updating...' : 'Saving...'}</>
              ) : (
                isEditing ? 'Update Entry' : 'Save Entry'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function ComputedRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${highlight ? 'text-emerald-600' : 'text-slate-700'}`}>{value}</span>
    </div>
  );
}

const inputCls = (err: boolean) =>
  `w-full px-3 py-2 rounded-lg border text-sm text-slate-800 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 transition-shadow ${
    err ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-emerald-200 focus:border-emerald-400'
  }`;

const selectCls = (err: boolean) =>
  `w-full px-3 py-2 rounded-lg border text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 transition-shadow ${
    err ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-emerald-200 focus:border-emerald-400'
  }`;
