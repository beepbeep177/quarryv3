import { useEffect, useState, useCallback } from 'react';
import { X, Calculator, Loader2, CheckCircle, PlusCircle, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Customer, Truck, Pricing, PaymentMode, TransactionStatus, TransactionWithRelations } from '../lib/database.types';

interface AddEntryModalProps {
  onClose: () => void;
  onSuccess: () => void;
  transaction?: TransactionWithRelations;
}

interface ProductRow {
  dr_number: string;
  material_type: string;
  length_cm: string;
  width_cm: string;
  height_cm: string;
  unit_price: string;
  dr_capitol: string;
  passway: string;
  kulot: string;
}

interface FormData {
  customer_id: string;
  truck_id: string;
  transaction_date: string;
  payment_mode: PaymentMode;
  status: TransactionStatus;
  notes: string;
  products: ProductRow[];
}

const todayDate = new Date().toISOString().split('T')[0];

function emptyProduct(defaultPrice = '', defaultMaterial = ''): ProductRow {
  return {
    dr_number: '',
    material_type: defaultMaterial,
    length_cm: '',
    width_cm: '',
    height_cm: '',
    unit_price: defaultPrice,
    dr_capitol: '0',
    passway: '0',
    kulot: '0',
  };
}

function formatVolume(v: number) {
  return v.toFixed(2);
}

const EMPTY_FORM: FormData = {
  customer_id: '',
  truck_id: '',
  transaction_date: todayDate,
  payment_mode: 'CASH',
  status: 'PAID',
  notes: '',
  products: [emptyProduct()],
};

function txToForm(tx: TransactionWithRelations): FormData {
  return {
    customer_id: tx.customer_id,
    truck_id: tx.truck_id,
    transaction_date: tx.transaction_date,
    payment_mode: tx.payment_mode,
    status: tx.status,
    notes: tx.notes ?? '',
    products: [{
      dr_number: tx.dr_number,
      material_type: tx.material_type ?? '',
      length_cm: String(tx.length_cm),
      width_cm: String(tx.width_cm),
      height_cm: String(tx.height_cm),
      unit_price: String(tx.unit_price),
      dr_capitol: String(tx.dr_capitol),
      passway: String(tx.passway),
      kulot: String(tx.kulot),
    }],
  };
}

export default function AddEntryModal({ onClose, onSuccess, transaction }: AddEntryModalProps) {
  const isEditing = !!transaction;
  const [form, setForm] = useState<FormData>(isEditing ? txToForm(transaction!) : EMPTY_FORM);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [pricingList, setPricingList] = useState<Pricing[]>([]);
  const [trucksLoading, setTrucksLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [headerErrors, setHeaderErrors] = useState<Partial<Record<'customer_id' | 'truck_id', string>>>({});
  const [productErrors, setProductErrors] = useState<Partial<Record<keyof ProductRow, string>>[]>([{}]);

  useEffect(() => {
    Promise.all([
      supabase.from('customers').select('*').order('name'),
      supabase.from('pricing').select('*').order('material_type'),
    ]).then(([c, p]) => {
      const customersData = (c.data ?? []) as Customer[];
      const pricingData = (p.data ?? []) as Pricing[];

      setCustomers(customersData);
      setPricingList(pricingData);

      if (!isEditing && pricingData.length > 0) {
        setForm(f => ({
          ...f,
          products: f.products.map(p => p.unit_price ? p : {
            ...p,
            unit_price: String(pricingData[0].unit_price),
            material_type: p.material_type || pricingData[0].material_type,
          }),
        }));
      }
    });
  }, [isEditing]);

  useEffect(() => {
    let active = true;

    async function fetchCustomerTrucks() {
      if (!form.customer_id) {
        setTrucks(isEditing && transaction ? [transaction.trucks].filter(Boolean) as Truck[] : []);
        setTrucksLoading(false);
        return;
      }

      setTrucksLoading(true);
      const { data: assignedData } = await supabase
        .from('trucks')
        .select('*')
        .eq('customer_id', form.customer_id)
        .order('plate_number');

      let nextTrucks = (assignedData ?? []) as Truck[];

      if (isEditing && transaction?.truck_id && !nextTrucks.some(truck => truck.id === transaction.truck_id)) {
        const { data: savedTruck } = await supabase
          .from('trucks')
          .select('*')
          .eq('id', transaction.truck_id)
          .maybeSingle();
        if (savedTruck) {
          nextTrucks = [...nextTrucks, savedTruck as Truck].sort((a, b) => a.plate_number.localeCompare(b.plate_number));
        }
      }

      if (!active) return;

      setTrucks(nextTrucks);
      setForm(current => (
        current.truck_id && nextTrucks.some(truck => truck.id === current.truck_id)
          ? current
          : { ...current, truck_id: '' }
      ));
      setTrucksLoading(false);
    }

    fetchCustomerTrucks();

    return () => {
      active = false;
    };
  }, [form.customer_id, isEditing, transaction]);

  const n = (val: string) => parseFloat(val) || 0;

  const productVolume = useCallback((p: ProductRow) => {
    const raw = (n(p.length_cm) * n(p.width_cm) * n(p.height_cm)) / 1_000_000;
    return parseFloat(raw.toFixed(2));
  }, []);

  const productAmount = useCallback((p: ProductRow) => parseFloat((productVolume(p) * n(p.unit_price)).toFixed(2)), [productVolume]);

  const productTotal = useCallback((p: ProductRow) => productAmount(p) + n(p.dr_capitol) + n(p.passway) + n(p.kulot), [productAmount]);

  const grandTotal = form.products.reduce((sum, p) => sum + productTotal(p), 0);

  const setHeader = (key: keyof Omit<FormData, 'products'>, val: string) => {
    setForm(f => ({ ...f, [key]: val }));
    setHeaderErrors(e => ({ ...e, [key]: undefined }));
  };

  const handleCustomerChange = (customerId: string) => {
    setForm(f => ({ ...f, customer_id: customerId, truck_id: '' }));
    setHeaderErrors(e => ({ ...e, customer_id: undefined, truck_id: undefined }));
  };

  const setProduct = (index: number, key: keyof ProductRow, val: string) => {
    setForm(f => ({
      ...f,
      products: f.products.map((p, i) => i === index ? { ...p, [key]: val } : p),
    }));
    setProductErrors(errs => errs.map((e, i) => i === index ? { ...e, [key]: undefined } : e));
  };

  const truckDimensions = useCallback((truck: Truck | undefined): Pick<ProductRow, 'length_cm' | 'width_cm' | 'height_cm'> => ({
    length_cm: truck && truck.length_cm > 0 ? String(truck.length_cm) : '',
    width_cm: truck && truck.width_cm > 0 ? String(truck.width_cm) : '',
    height_cm: truck && truck.height_cm > 0 ? String(truck.height_cm) : '',
  }), []);

  const addProduct = () => {
    const defaultPrice = pricingList.length > 0 ? String(pricingList[0].unit_price) : '';
    const defaultMaterial = pricingList.length > 0 ? pricingList[0].material_type : '';
    const truck = trucks.find(t => t.id === form.truck_id);
    const newRow: ProductRow = { ...emptyProduct(defaultPrice, defaultMaterial), ...truckDimensions(truck) };
    setForm(f => ({ ...f, products: [...f.products, newRow] }));
    setProductErrors(errs => [...errs, {}]);
  };

  const removeProduct = (index: number) => {
    setForm(f => ({ ...f, products: f.products.filter((_, i) => i !== index) }));
    setProductErrors(errs => errs.filter((_, i) => i !== index));
  };

  // Auto-fill truck dimensions into all product rows when truck changes
  const handleTruckChange = (truckId: string) => {
    const truck = trucks.find(t => t.id === truckId);
    const dims = truckDimensions(truck);
    setForm(f => ({
      ...f,
      truck_id: truckId,
      products: f.products.map(p => ({
        ...p,
        length_cm: dims.length_cm || p.length_cm,
        width_cm: dims.width_cm || p.width_cm,
        height_cm: dims.height_cm || p.height_cm,
      })),
    }));
    setHeaderErrors(e => ({ ...e, truck_id: undefined }));
  };

  function validate() {
    let valid = true;
    const hErrs: Partial<Record<'customer_id' | 'truck_id', string>> = {};
    if (!form.customer_id) { hErrs.customer_id = 'Required'; valid = false; }
    if (!form.truck_id) { hErrs.truck_id = 'Required'; valid = false; }
    setHeaderErrors(hErrs);

    const pErrs = form.products.map(p => {
      const e: Partial<Record<keyof ProductRow, string>> = {};
      if (!p.dr_number.trim()) { e.dr_number = 'Required'; valid = false; }
      if (!p.length_cm || n(p.length_cm) <= 0) { e.length_cm = 'Must be > 0'; valid = false; }
      if (!p.width_cm || n(p.width_cm) <= 0) { e.width_cm = 'Must be > 0'; valid = false; }
      if (!p.height_cm || n(p.height_cm) <= 0) { e.height_cm = 'Must be > 0'; valid = false; }
      if (!p.unit_price || n(p.unit_price) <= 0) { e.unit_price = 'Must be > 0'; valid = false; }
      return e;
    });
    setProductErrors(pErrs);

    return valid;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    setSaveError(null);

    if (isEditing) {
      // Edit mode: single product row
      const p = form.products[0];
      const payload = {
        transaction_date: form.transaction_date,
        customer_id: form.customer_id,
        truck_id: form.truck_id,
        dr_number: p.dr_number.trim(),
        material_type: p.material_type || 'Crushed Stone',
        length_cm: n(p.length_cm),
        width_cm: n(p.width_cm),
        height_cm: n(p.height_cm),
        unit_price: n(p.unit_price),
        dr_capitol: n(p.dr_capitol),
        passway: n(p.passway),
        kulot: n(p.kulot),
        payment_mode: form.payment_mode,
        status: form.status,
        notes: form.notes,
      };
      const { error } = await supabase.from('transactions').update(payload).eq('id', transaction!.id);
      setSaving(false);
      if (!error) {
        setSaved(true);
        setTimeout(() => { onSuccess(); onClose(); }, 900);
      } else {
        setSaveError(error.message || 'Failed to save. Please try again.');
      }
    } else {
      // Add mode: insert one transaction per product row
      const rows = form.products.map(p => ({
        transaction_date: form.transaction_date,
        customer_id: form.customer_id,
        truck_id: form.truck_id,
        dr_number: p.dr_number.trim(),
        material_type: p.material_type || 'Crushed Stone',
        length_cm: n(p.length_cm),
        width_cm: n(p.width_cm),
        height_cm: n(p.height_cm),
        unit_price: n(p.unit_price),
        dr_capitol: n(p.dr_capitol),
        passway: n(p.passway),
        kulot: n(p.kulot),
        payment_mode: form.payment_mode,
        status: (form.payment_mode === 'CASH' ? 'PAID' : 'PENDING') as TransactionStatus,
        notes: form.notes,
      }));
      const { error } = await supabase.from('transactions').insert(rows);
      setSaving(false);
      if (!error) {
        setSaved(true);
        setTimeout(() => { onSuccess(); onClose(); }, 900);
      } else {
        setSaveError(error.message || 'Failed to save. Please try again.');
      }
    }
  }

  const fmt = (v: number) => v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const paymentModes: PaymentMode[] = ['CASH', 'P.O', 'OFFSET', 'GCASH', 'BANK_TRANSFER'];

  const paymentModeColor = (mode: PaymentMode, active: boolean) => {
    if (!active) return 'border-slate-200 text-slate-500 hover:border-slate-300 bg-white';
    if (mode === 'CASH') return 'bg-emerald-500 border-emerald-500 text-white shadow-sm shadow-emerald-200';
    if (mode === 'P.O') return 'bg-amber-500 border-amber-500 text-white shadow-sm shadow-amber-200';
    if (mode === 'GCASH') return 'bg-blue-500 border-blue-500 text-white shadow-sm shadow-blue-200';
    if (mode === 'BANK_TRANSFER') return 'bg-violet-500 border-violet-500 text-white shadow-sm shadow-violet-200';
    return 'bg-slate-600 border-slate-600 text-white';
  };

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
                onChange={e => setHeader('transaction_date', e.target.value)}
                className={inputCls(false)}
              />
            </Field>
          )}

          {/* Customer & Truck */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Customer" error={headerErrors.customer_id}>
              <select value={form.customer_id} onChange={e => handleCustomerChange(e.target.value)} className={selectCls(!!headerErrors.customer_id)}>
                <option value="">Select customer...</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Truck Plate #" error={headerErrors.truck_id}>
              <select value={form.truck_id} onChange={e => handleTruckChange(e.target.value)} disabled={!form.customer_id || trucksLoading} className={selectCls(!!headerErrors.truck_id)}>
                <option value="">
                  {!form.customer_id
                    ? 'Select customer first...'
                    : trucksLoading
                      ? 'Loading trucks...'
                      : trucks.length === 0
                        ? 'No trucks available for selected customer'
                        : 'Select truck...'}
                </option>
                {trucks.map(t => <option key={t.id} value={t.id}>{t.plate_number} — {t.driver_name}</option>)}
              </select>
            </Field>
          </div>

          {/* Payment Mode */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Mode of Payment</p>
            <div className="flex gap-2 flex-wrap">
              {paymentModes.map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setHeader('payment_mode', mode)}
                  className={`flex-1 min-w-[80px] py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${paymentModeColor(mode, form.payment_mode === mode)}`}
                >
                  {mode === 'BANK_TRANSFER' ? 'BANK' : mode}
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
                    onClick={() => setHeader('status', s)}
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

          {/* Product Rows */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Products ({form.products.length})
              </p>
            </div>

            {form.products.map((product, index) => (
              <ProductSection
                key={index}
                index={index}
                product={product}
                errors={productErrors[index] ?? {}}
                pricingList={pricingList}
                showRemove={!isEditing && form.products.length > 1}
                onRemove={() => removeProduct(index)}
                onChange={(key, val) => setProduct(index, key, val)}
                productVolume={productVolume}
                productAmount={productAmount}
                productTotal={productTotal}
                fmt={fmt}
              />
            ))}

            {!isEditing && (
              <button
                type="button"
                onClick={addProduct}
                className="w-full py-2.5 rounded-xl border-2 border-dashed border-emerald-300 text-emerald-600 text-sm font-semibold hover:border-emerald-400 hover:bg-emerald-50 transition-all flex items-center justify-center gap-2"
              >
                <PlusCircle size={16} />
                Add Another Product
              </button>
            )}
          </div>

          {/* Notes */}
          <Field label="Notes (optional)">
            <textarea
              rows={2}
              placeholder="Additional remarks..."
              value={form.notes}
              onChange={e => setHeader('notes', e.target.value)}
              className={inputCls(false) + ' resize-none'}
            />
          </Field>

          {/* Total Summary */}
          <div className="flex items-center justify-between bg-slate-900 rounded-xl px-5 py-4">
            <span className="text-slate-300 text-sm font-medium">Grand Total</span>
            <span className="text-2xl font-bold text-emerald-400">₱{fmt(grandTotal)}</span>
          </div>

          {/* Save Error */}
          {saveError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {saveError}
            </div>
          )}

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
                isEditing ? 'Update Entry' : `Save ${form.products.length > 1 ? `${form.products.length} Entries` : 'Entry'}`
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ProductSectionProps {
  index: number;
  product: ProductRow;
  errors: Partial<Record<keyof ProductRow, string>>;
  pricingList: Pricing[];
  showRemove: boolean;
  onRemove: () => void;
  onChange: (key: keyof ProductRow, val: string) => void;
  productVolume: (p: ProductRow) => number;
  productAmount: (p: ProductRow) => number;
  productTotal: (p: ProductRow) => number;
  fmt: (v: number) => string;
}

function ProductSection({ index, product, errors, pricingList, showRemove, onRemove, onChange, productVolume, productAmount, productTotal, fmt }: ProductSectionProps) {
  const vol = productVolume(product);
  const amt = productAmount(product);
  const total = productTotal(product);
  const n = (val: string) => parseFloat(val) || 0;
  const selectedPricingId = pricingList.find(p =>
    p.material_type === product.material_type && Number(p.unit_price) === n(product.unit_price)
  )?.id ?? '';

  return (
    <div className="border border-slate-200 rounded-xl p-4 space-y-4 bg-slate-50/50">
      {/* Product header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Product {index + 1}</span>
        {showRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors"
          >
            <Trash2 size={13} />
            Remove
          </button>
        )}
      </div>

      {/* DR Number */}
      <Field label="DR Number" error={errors.dr_number}>
        <input
          type="text"
          placeholder="e.g. DR-2026-001"
          value={product.dr_number}
          onChange={e => onChange('dr_number', e.target.value)}
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
                value={product[key]}
                onChange={e => onChange(key, e.target.value)}
                className={inputCls(!!errors[key])}
              />
            </Field>
          ))}
        </div>
      </div>

      {/* Auto-Compute Preview */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calculator size={15} className="text-emerald-500" />
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Auto-Computed Values</span>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          <ComputedRow label="Volume (m³)" value={`${formatVolume(vol)} m³`} highlight />
          <ComputedRow label="Unit Price" value={`₱${fmt(n(product.unit_price))}`} />
          <ComputedRow label="Amount" value={`₱${fmt(amt)}`} highlight />
          <ComputedRow label="Total" value={`₱${fmt(total)}`} />
        </div>
      </div>

      {/* Unit Price */}
      <Field label="Unit Price (₱/m³)" error={errors.unit_price}>
        <div className="space-y-2">
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={product.unit_price}
            onChange={e => onChange('unit_price', e.target.value)}
            className={inputCls(!!errors.unit_price)}
          />
          <select
            value={selectedPricingId}
            onChange={e => {
              const selected = pricingList.find(p => p.id === e.target.value);
              if (!selected) return;
              onChange('unit_price', String(selected.unit_price));
              onChange('material_type', selected.material_type);
            }}
            disabled={pricingList.length === 0}
            className={inputCls(false)}
          >
            <option value="">{pricingList.length === 0 ? 'No products available' : 'Select product price...'}</option>
            {pricingList.map(p => (
              <option key={p.id} value={p.id}>
                {p.material_type} <span className="opacity-75">₱{p.unit_price}</span>
              </option>
            ))}
          </select>
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
                value={product[key]}
                onChange={e => onChange(key, e.target.value)}
                className={inputCls(false)}
              />
            </Field>
          ))}
        </div>
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
