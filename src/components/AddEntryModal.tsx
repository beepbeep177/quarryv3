import { useEffect, useState, useCallback } from 'react';
import { X, Calculator, Loader2, CheckCircle, PlusCircle, Trash2, ImagePlus, AlertTriangle, Wallet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Customer, CustomerCreditEntry, Truck, Pricing, PaymentMode, TransactionStatus, TransactionWithRelations } from '../lib/database.types';
import { PAYMENT_MODES, SPLIT_PAYMENT_MODES, type SplitPaymentMode } from '../lib/payment';

interface AddEntryModalProps {
  onClose: () => void;
  onSuccess: () => void;
  transaction?: TransactionWithRelations;
  canUploadAttachments?: boolean;
}

interface ProductRow {
  dr_number: string;
  material_type: string;
  length_cm: string;
  width_cm: string;
  height_cm: string;
  unit_price: string;
  dr_capitol: string;
  delivery_fee: string;
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
  split_payment_details: SplitPaymentDetailInput[];
  products: ProductRow[];
}

interface SplitPaymentDetailInput {
  mode: SplitPaymentMode;
  amount: string;
}

function toInputDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

const todayDate = toInputDate(new Date());
const ATTACHMENTS_BUCKET = 'transaction-attachments';
const MAX_ATTACHMENTS = 5;

function emptyProduct(defaultPrice = '', defaultMaterial = ''): ProductRow {
  return {
    dr_number: '',
    material_type: defaultMaterial,
    length_cm: '',
    width_cm: '',
    height_cm: '',
    unit_price: defaultPrice,
    dr_capitol: '0',
    delivery_fee: '0',
    passway: '0',
    kulot: '0',
  };
}

const round2 = (value: number) => Math.round(value * 100) / 100;
// Half-cent tolerance avoids false validation failures from floating-point decimal input arithmetic.
const SPLIT_AMOUNT_TOLERANCE = 0.005;

function formatVolume(v: number) {
  return v.toFixed(2);
}

function getFileExtension(file: File): string {
  const fileNameExt = file.name.includes('.') ? file.name.split('.').pop()?.trim().toLowerCase() ?? '' : '';
  if (/^[a-z0-9]+$/.test(fileNameExt)) return fileNameExt;
  const mimeExt = file.type.split('/')[1]?.split('+')[0]?.toLowerCase() ?? '';
  return /^[a-z0-9]+$/.test(mimeExt) ? mimeExt : 'jpg';
}

function getAttachmentFolder(date: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayDate;
}

const EMPTY_FORM: FormData = {
  customer_id: '',
  truck_id: '',
  transaction_date: todayDate,
  payment_mode: 'CASH',
  status: 'PAID',
  notes: '',
  split_payment_details: [],
  products: [emptyProduct()],
};

function txToForm(tx: TransactionWithRelations): FormData {
  const splitPaymentDetails = Array.isArray(tx.split_payment_details)
    ? tx.split_payment_details
        .map(item => {
          const mode = item && typeof item === 'object' && 'mode' in item ? String(item.mode) : '';
          const amount = item && typeof item === 'object' && 'amount' in item ? Number(item.amount) : NaN;
          const isValidMode = SPLIT_PAYMENT_MODES.includes(mode as SplitPaymentMode);
          if (!isValidMode || Number.isNaN(amount) || amount < 0) return null;
          return { mode: mode as SplitPaymentMode, amount: String(amount) };
        })
        .filter((item): item is SplitPaymentDetailInput => !!item)
        .slice(0, 2)
    : [];

  return {
    customer_id: tx.customer_id,
    truck_id: tx.truck_id,
    transaction_date: tx.transaction_date,
    payment_mode: tx.payment_mode,
    status: tx.status,
    notes: tx.notes ?? '',
    split_payment_details: splitPaymentDetails,
    products: [{
      dr_number: tx.dr_number,
      material_type: tx.material_type ?? '',
      length_cm: String(tx.length_cm),
      width_cm: String(tx.width_cm),
      height_cm: String(tx.height_cm),
      unit_price: String(tx.unit_price),
      dr_capitol: String(tx.dr_capitol),
      delivery_fee: String(tx.delivery_fee ?? 0),
      passway: String(tx.passway),
      kulot: String(tx.kulot),
    }],
  };
}

export default function AddEntryModal({ onClose, onSuccess, transaction, canUploadAttachments = true }: AddEntryModalProps) {
  const isEditing = !!transaction;
  const [form, setForm] = useState<FormData>(isEditing ? txToForm(transaction!) : EMPTY_FORM);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerCreditBalances, setCustomerCreditBalances] = useState<Record<string, number>>({});
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [pricingList, setPricingList] = useState<Pricing[]>([]);
  const [trucksLoading, setTrucksLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [headerErrors, setHeaderErrors] = useState<Partial<Record<'customer_id' | 'truck_id', string>>>({});
  const [productErrors, setProductErrors] = useState<Partial<Record<keyof ProductRow, string>>[]>([{}]);
  const [existingAttachmentUrls, setExistingAttachmentUrls] = useState<string[]>(transaction?.attachment_urls ?? []);
  const [newAttachmentFiles, setNewAttachmentFiles] = useState<File[]>([]);
  const [showZeroPriceWarning, setShowZeroPriceWarning] = useState(false);
  const [splitPaymentError, setSplitPaymentError] = useState<string | null>(null);
  const [customerCreditBalance, setCustomerCreditBalance] = useState(0);
  const [customerCreditLoading, setCustomerCreditLoading] = useState(false);
  const [customerCreditError, setCustomerCreditError] = useState<string | null>(null);

  const loadCustomerCreditBalance = useCallback(async (customerId: string) => {
    const { data, error } = await supabase.rpc('get_customer_credit_balance', {
      p_customer_id: customerId,
      p_exclude_source_table: isEditing ? 'transactions' : null,
      p_exclude_source_id: isEditing ? transaction!.id : null,
    });

    if (error) throw new Error(error.message);
    return Number(data ?? 0);
  }, [isEditing, transaction]);

  useEffect(() => {
    Promise.all([
      supabase.from('customers').select('*').order('name'),
      supabase.from('pricing').select('*').order('material_type'),
      supabase.from('customer_credit_entries').select('customer_id, debit_amount, credit_amount, status').eq('status', 'ACTIVE'),
    ]).then(([c, p, creditEntries]) => {
      const customersData = (c.data ?? []) as Customer[];
      const pricingData = (p.data ?? []) as Pricing[];
      const creditRows = (creditEntries.data ?? []) as Pick<CustomerCreditEntry, 'customer_id' | 'debit_amount' | 'credit_amount' | 'status'>[];
      const creditBalanceMap = creditRows.reduce<Record<string, number>>((map, row) => {
        map[row.customer_id] = (map[row.customer_id] ?? 0) + Number(row.credit_amount ?? 0) - Number(row.debit_amount ?? 0);
        return map;
      }, {});

      setCustomers(customersData);
      setPricingList(pricingData);
      setCustomerCreditBalances(creditBalanceMap);

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
    setExistingAttachmentUrls(transaction?.attachment_urls ?? []);
    setNewAttachmentFiles([]);
    setShowZeroPriceWarning(false);
    setSplitPaymentError(null);
  }, [transaction]);

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

  useEffect(() => {
    let active = true;

    async function fetchCustomerCreditBalance() {
      if (!form.customer_id) {
        setCustomerCreditBalance(0);
        setCustomerCreditError(null);
        setCustomerCreditLoading(false);
        return;
      }

      setCustomerCreditLoading(true);
      setCustomerCreditError(null);
      try {
        const balance = await loadCustomerCreditBalance(form.customer_id);
        if (!active) return;
        setCustomerCreditBalance(balance);
      } catch (error) {
        if (!active) return;
        setCustomerCreditBalance(0);
        setCustomerCreditError(error instanceof Error ? error.message : 'Unable to load customer credit balance.');
      }
      setCustomerCreditLoading(false);
    }

    fetchCustomerCreditBalance();

    return () => {
      active = false;
    };
  }, [form.customer_id, loadCustomerCreditBalance]);

  const n = (val: string) => parseFloat(val) || 0;

  const productVolume = useCallback((p: ProductRow) => {
    const raw = (n(p.length_cm) * n(p.width_cm) * n(p.height_cm)) / 1_000_000;
    return parseFloat(raw.toFixed(2));
  }, []);

  const productAmount = useCallback((p: ProductRow) => parseFloat((productVolume(p) * n(p.unit_price)).toFixed(2)), [productVolume]);

  const productTotal = useCallback((p: ProductRow) => productAmount(p) + n(p.dr_capitol) + n(p.delivery_fee) + n(p.passway) + n(p.kulot), [productAmount]);

  const rawGrandTotal = form.products.reduce((sum, p) => sum + productTotal(p), 0);
  const isDonationMode = form.payment_mode === 'DONATION';
  const grandTotal = isDonationMode ? 0 : rawGrandTotal;
  const selectedCustomer = customers.find(customer => customer.id === form.customer_id) ?? null;
  const selectedCustomerLabel = selectedCustomer?.name ?? 'selected customer';
  const selectedCustomerCreditAmount = form.payment_mode === 'CUSTOMER_CREDIT'
    ? grandTotal
    : form.payment_mode === 'SPLIT'
      ? form.split_payment_details.reduce((sum, detail) => detail.mode === 'CUSTOMER_CREDIT' ? sum + (Number(detail.amount) || 0) : sum, 0)
      : 0;
  const customerCreditShortfallFor = (balance: number) => selectedCustomerCreditAmount > balance + SPLIT_AMOUNT_TOLERANCE;
  const hasCustomerCreditShortfall = customerCreditShortfallFor(customerCreditBalance);

  const setHeader = (key: keyof Omit<FormData, 'products' | 'split_payment_details'>, val: string) => {
    setForm(f => ({ ...f, [key]: val }));
    if (key === 'customer_id' || key === 'truck_id') {
      setHeaderErrors(e => ({ ...e, [key]: undefined }));
    }
    if (key === 'payment_mode') {
      setSplitPaymentError(null);
      setSaveError(null);
    }
  };

  const handleCustomerChange = (customerId: string) => {
    setForm(f => ({ ...f, customer_id: customerId, truck_id: '' }));
    setHeaderErrors(e => ({ ...e, customer_id: undefined, truck_id: undefined }));
    setSaveError(null);
  };

  const setProduct = (index: number, key: keyof ProductRow, val: string) => {
    setForm(f => ({
      ...f,
      products: f.products.map((p, i) => i === index ? { ...p, [key]: val } : p),
    }));
    setProductErrors(errs => errs.map((e, i) => i === index ? { ...e, [key]: undefined } : e));
  };

  const splitModes: SplitPaymentMode[] = [...SPLIT_PAYMENT_MODES];

  const autoSplitAmounts = useCallback((modes: SplitPaymentMode[], total: number): SplitPaymentDetailInput[] => {
    if (modes.length === 0) return [];
    const safeTotal = Math.max(0, round2(total));
    const base = round2(safeTotal / modes.length);
    let allocated = 0;
    return modes.map((mode, index) => {
      const amount = index === modes.length - 1 ? round2(safeTotal - allocated) : base;
      allocated = round2(allocated + amount);
      return { mode, amount: amount.toFixed(2) };
    });
  }, []);

  const toggleSplitMode = (mode: SplitPaymentMode) => {
    setForm(current => {
      const isSelected = current.split_payment_details.some(detail => detail.mode === mode);
      let modes = current.split_payment_details.map(detail => detail.mode);

      if (isSelected) {
        modes = modes.filter(selectedMode => selectedMode !== mode);
      } else {
        if (modes.length >= 2) return current;
        modes = [...modes, mode];
      }

      return {
        ...current,
        split_payment_details: autoSplitAmounts(modes, grandTotal),
      };
    });
    setSplitPaymentError(null);
  };

  const setSplitAmount = (mode: SplitPaymentMode, value: string) => {
    setForm(current => ({
      ...current,
      split_payment_details: current.split_payment_details.map(detail =>
        detail.mode === mode ? { ...detail, amount: value } : detail
      ),
    }));
    setSplitPaymentError(null);
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

  const totalAttachmentCount = existingAttachmentUrls.length + newAttachmentFiles.length;

  const handleAttachmentSelection = (files: FileList | null) => {
    if (!canUploadAttachments) {
      setSaveError('This user group cannot upload attachments.');
      return;
    }
    if (!files) return;
    const selectedImages = Array.from(files).filter(file => file.type.startsWith('image/'));
    const remainingSlots = Math.max(0, MAX_ATTACHMENTS - totalAttachmentCount);
    if (remainingSlots === 0) {
      setSaveError(`Maximum ${MAX_ATTACHMENTS} attachments allowed.`);
      return;
    }
    const toAdd = selectedImages.slice(0, remainingSlots);
    setNewAttachmentFiles(prev => [...prev, ...toAdd]);
    setSaveError(null);
  };

  const removeExistingAttachment = (url: string) => {
    setExistingAttachmentUrls(prev => prev.filter(item => item !== url));
  };

  const removeNewAttachment = (index: number) => {
    setNewAttachmentFiles(prev => prev.filter((_, i) => i !== index));
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

  function validate(creditBalance = customerCreditBalance) {
    let valid = true;
    const hasCreditShortfall = customerCreditShortfallFor(creditBalance);
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
      const price = Number(p.unit_price);
      if (p.unit_price === '' || Number.isNaN(price) || price < 0) { e.unit_price = 'Must be a number >= 0'; valid = false; }
      return e;
    });
    setProductErrors(pErrs);

    if (form.payment_mode === 'SPLIT') {
      if (form.split_payment_details.length !== 2) {
        setSplitPaymentError('Select exactly 2 payment modes for split payment.');
        valid = false;
      } else {
        const splitAmounts = form.split_payment_details.map(detail => Number(detail.amount));
        const hasInvalidAmount = splitAmounts.some(amount => Number.isNaN(amount) || amount < 0);
        const totalSplitAmount = splitAmounts.reduce((sum, amount) => sum + (Number.isNaN(amount) ? 0 : amount), 0);
        if (hasInvalidAmount) {
          setSplitPaymentError('Split payment amounts must be valid numbers.');
          valid = false;
        } else if (Math.abs(round2(totalSplitAmount) - round2(grandTotal)) > SPLIT_AMOUNT_TOLERANCE) {
          setSplitPaymentError(`Split payment amounts must total ₱${fmt(grandTotal)}.`);
          valid = false;
        } else if (selectedCustomerCreditAmount > 0 && hasCreditShortfall) {
          setSplitPaymentError(`Customer Credit for ${selectedCustomerLabel} exceeds available balance of PHP ${fmt(creditBalance)}.`);
          valid = false;
        } else {
          setSplitPaymentError(null);
        }
      }
    } else {
      setSplitPaymentError(null);
    }

    if (form.payment_mode === 'CUSTOMER_CREDIT' && hasCreditShortfall) {
      setSaveError(`Insufficient customer credit balance for ${selectedCustomerLabel}. Available: PHP ${fmt(creditBalance)}, required: PHP ${fmt(selectedCustomerCreditAmount)}.`);
      valid = false;
    }

    return valid;
  }

  const hasZeroUnitPrice = !isDonationMode && form.products.some(product => product.unit_price !== '' && n(product.unit_price) === 0);

  async function uploadNewAttachments() {
    if (!canUploadAttachments && newAttachmentFiles.length > 0) {
      throw new Error('This user group cannot upload attachments.');
    }

    const uploadedPaths: string[] = [];

    try {
      for (const file of newAttachmentFiles) {
        const extension = getFileExtension(file);
        const filePath = `${getAttachmentFolder(form.transaction_date)}/${crypto.randomUUID()}.${extension}`;
        const { error } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(filePath, file, {
          contentType: file.type,
          upsert: false,
        });
        if (error) {
          throw new Error(error.message || 'Failed to upload attachment.');
        }
        uploadedPaths.push(filePath);
      }
    } catch (error) {
      if (uploadedPaths.length > 0) {
        const { error: cleanupError } = await supabase.storage.from(ATTACHMENTS_BUCKET).remove(uploadedPaths);
        if (cleanupError) {
          console.error('Attachment cleanup failed:', cleanupError.message);
        }
      }
      throw error;
    }

    return uploadedPaths;
  }

  async function persistForm() {
    if (saving) return;

    setSaving(true);
    setSaveError(null);

    try {
      const uploadedPaths = await uploadNewAttachments();
      const attachmentUrls = canUploadAttachments
        ? [...existingAttachmentUrls, ...uploadedPaths]
        : (transaction?.attachment_urls ?? []);

      if (isEditing) {
        const p = form.products[0];
        const splitDetails = form.payment_mode === 'SPLIT'
          ? form.split_payment_details.map(detail => ({
              mode: detail.mode,
              amount: round2(Number(detail.amount) || 0),
            }))
          : [];
        const payload = {
          transaction_date: form.transaction_date,
          customer_id: form.customer_id,
          truck_id: form.truck_id,
          dr_number: p.dr_number.trim(),
          material_type: p.material_type || 'Crushed Stone',
          length_cm: n(p.length_cm),
          width_cm: n(p.width_cm),
          height_cm: n(p.height_cm),
          unit_price: isDonationMode ? 0 : n(p.unit_price),
          dr_capitol: isDonationMode ? 0 : n(p.dr_capitol),
          delivery_fee: isDonationMode ? 0 : n(p.delivery_fee),
          passway: isDonationMode ? 0 : n(p.passway),
          kulot: isDonationMode ? 0 : n(p.kulot),
          payment_mode: form.payment_mode,
          status: isDonationMode || form.payment_mode === 'CUSTOMER_CREDIT' ? 'PAID' : form.status,
          notes: form.notes,
          attachment_urls: attachmentUrls,
          split_payment_details: splitDetails,
        };
        const { error } = await supabase.from('transactions').update(payload).eq('id', transaction!.id);
        if (error) throw new Error(error.message || 'Failed to save. Please try again.');
      } else {
        const splitDetails = form.payment_mode === 'SPLIT'
          ? form.split_payment_details.map(detail => ({
              mode: detail.mode,
              amount: round2(Number(detail.amount) || 0),
            }))
          : [];
        const splitRatios = grandTotal > 0
          ? splitDetails.map(detail => detail.amount / grandTotal)
          : splitDetails.map(() => 0);
        const rows = form.products.map(p => ({
          transaction_date: form.transaction_date,
          customer_id: form.customer_id,
          truck_id: form.truck_id,
          dr_number: p.dr_number.trim(),
          material_type: p.material_type || 'Crushed Stone',
          length_cm: n(p.length_cm),
          width_cm: n(p.width_cm),
          height_cm: n(p.height_cm),
          unit_price: isDonationMode ? 0 : n(p.unit_price),
          dr_capitol: isDonationMode ? 0 : n(p.dr_capitol),
          delivery_fee: isDonationMode ? 0 : n(p.delivery_fee),
          passway: isDonationMode ? 0 : n(p.passway),
          kulot: isDonationMode ? 0 : n(p.kulot),
          payment_mode: form.payment_mode,
          status: (isDonationMode || form.payment_mode === 'CASH' || form.payment_mode === 'CUSTOMER_CREDIT' ? 'PAID' : 'PENDING') as TransactionStatus,
          notes: form.notes,
          attachment_urls: attachmentUrls,
          split_payment_details: form.payment_mode === 'SPLIT'
            ? (() => {
                const rowTotal = productTotal(p);
                let allocated = 0;
                return splitDetails.map((detail, index) => {
                  const amount = index === splitDetails.length - 1
                    ? round2(rowTotal - allocated)
                    : round2(rowTotal * splitRatios[index]);
                  allocated = round2(allocated + amount);
                  return { mode: detail.mode, amount };
                });
              })()
            : [],
        }));
        const { error } = await supabase.from('transactions').insert(rows);
        if (error) throw new Error(error.message || 'Failed to save. Please try again.');
      }

      setSaved(true);
      setTimeout(() => { onSuccess(); onClose(); }, 900);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save. Please try again.';
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    let validationCreditBalance = customerCreditBalance;
    if (form.customer_id && selectedCustomerCreditAmount > 0) {
      setCustomerCreditLoading(true);
      setCustomerCreditError(null);
      try {
        validationCreditBalance = await loadCustomerCreditBalance(form.customer_id);
        setCustomerCreditBalance(validationCreditBalance);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load customer credit balance.';
        setCustomerCreditError(message);
        setSaveError(message);
        setCustomerCreditLoading(false);
        return;
      }
      setCustomerCreditLoading(false);
    }

    if (!validate(validationCreditBalance)) return;
    if (hasZeroUnitPrice) {
      setShowZeroPriceWarning(true);
      return;
    }
    await persistForm();
  }

  const fmt = (v: number) => v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const paymentModes: PaymentMode[] = [...PAYMENT_MODES];
  const customerCreditUnavailableForFullPayment = !form.customer_id || hasCustomerCreditShortfall || customerCreditBalance <= 0;

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
                {customers.map(c => {
                  const creditBalance = customerCreditBalances[c.id] ?? 0;
                  return (
                    <option key={c.id} value={c.id}>
                      {c.name}{creditBalance > 0 ? ` - Credit PHP ${fmt(creditBalance)}` : ''}
                    </option>
                  );
                })}
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
          <Field label="Mode of Payment">
            <select
              value={form.payment_mode}
              onChange={e => setHeader('payment_mode', e.target.value)}
              className={selectCls(false)}
            >
              {paymentModes.map(mode => (
                <option
                  key={mode}
                  value={mode}
                  disabled={mode === 'CUSTOMER_CREDIT' && form.payment_mode !== 'CUSTOMER_CREDIT' && customerCreditUnavailableForFullPayment}
                >
                  {mode === 'BANK_TRANSFER'
                    ? 'BANK TRANSFER'
                    : mode === 'CUSTOMER_CREDIT'
                      ? `CUSTOMER CREDIT${form.customer_id ? ` (PHP ${fmt(customerCreditBalance)})` : ''}`
                      : mode}
                </option>
              ))}
            </select>
          </Field>

          {form.customer_id && (
            <div className={`rounded-xl border px-4 py-3 text-sm ${hasCustomerCreditShortfall ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-100 bg-emerald-50 text-emerald-800'}`}>
              <div className="flex items-center gap-2">
                <Wallet size={16} />
                <span className="font-semibold">Customer Credit Balance for {selectedCustomerLabel}:</span>
                <span className="font-bold tabular-nums">{customerCreditLoading ? 'Loading...' : `PHP ${fmt(customerCreditBalance)}`}</span>
              </div>
              {customerCreditError && <p className="text-xs mt-1 text-red-600">{customerCreditError}</p>}
              {hasCustomerCreditShortfall && (
                <p className="text-xs mt-1">Insufficient balance for the selected customer credit amount. Use P.O, cash, or another mode instead.</p>
              )}
            </div>
          )}

          {form.payment_mode === 'SPLIT' && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Split Payment (select 2)</p>
              <div className="flex gap-2 flex-wrap">
                {splitModes.map(mode => {
                  const active = form.split_payment_details.some(detail => detail.mode === mode);
                  const disabled = mode === 'CUSTOMER_CREDIT' && !active && (!form.customer_id || customerCreditBalance <= 0);
                  return (
                    <button
                      key={mode}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleSplitMode(mode)}
                      className={`flex-1 min-w-[88px] py-2 rounded-lg text-xs font-semibold border-2 transition-all ${
                        active
                          ? mode === 'CASH'
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : mode === 'P.O'
                              ? 'bg-amber-500 border-amber-500 text-white'
                              : mode === 'GCASH'
                                ? 'bg-blue-500 border-blue-500 text-white'
                                : mode === 'BANK_TRANSFER'
                                  ? 'bg-violet-500 border-violet-500 text-white'
                                  : mode === 'CUSTOMER_CREDIT'
                                    ? 'bg-teal-500 border-teal-500 text-white'
                                    : 'bg-slate-600 border-slate-600 text-white'
                          : disabled
                            ? 'bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed'
                            : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      {mode === 'BANK_TRANSFER' ? 'BANK' : mode === 'CUSTOMER_CREDIT' ? 'CREDIT' : mode}
                    </button>
                  );
                })}
              </div>
              {form.split_payment_details.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {form.split_payment_details.map(detail => (
                    <Field key={detail.mode} label={`${detail.mode === 'BANK_TRANSFER' ? 'BANK TRANSFER' : detail.mode === 'CUSTOMER_CREDIT' ? 'CUSTOMER CREDIT' : detail.mode} Amount`}>
                      <input
                        type="number"
                        min="0"
                        max={detail.mode === 'CUSTOMER_CREDIT' ? customerCreditBalance : undefined}
                        step="0.01"
                        value={detail.amount}
                        onChange={e => setSplitAmount(detail.mode, e.target.value)}
                        className={inputCls(false)}
                      />
                    </Field>
                  ))}
                </div>
              )}
              {splitPaymentError && (
                <p className="text-xs text-red-500">{splitPaymentError}</p>
              )}
            </div>
          )}

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

          {/* Attachments */}
          {(canUploadAttachments || existingAttachmentUrls.length > 0) && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Attachments ({totalAttachmentCount}/{MAX_ATTACHMENTS})
              </p>
              {canUploadAttachments && (
                <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold cursor-pointer hover:bg-slate-50">
                  <ImagePlus size={13} />
                  Add Image
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={e => {
                      handleAttachmentSelection(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>

            {existingAttachmentUrls.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {existingAttachmentUrls.map(url => (
                  <div key={url} className="relative rounded-lg overflow-hidden border border-slate-200 bg-white">
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt="Attachment" className="w-full h-24 object-cover" />
                    </a>
                    {canUploadAttachments && (
                      <button
                        type="button"
                        onClick={() => removeExistingAttachment(url)}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-slate-900/70 text-white flex items-center justify-center"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {newAttachmentFiles.length > 0 && (
              <div className="space-y-2">
                {newAttachmentFiles.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <span className="text-xs text-slate-600 truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeNewAttachment(index)}
                      className="text-xs text-red-500 hover:text-red-700 font-semibold"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}

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

      {showZeroPriceWarning && (
        <div className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-amber-100">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-500" />
              <p className="text-sm font-bold text-slate-800">Confirm zero unit price</p>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-slate-600">One or more products have a unit price of ₱0.00. Continue saving this entry?</p>
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button
                type="button"
                onClick={() => setShowZeroPriceWarning(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowZeroPriceWarning(false);
                  await persistForm();
                }}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm"
              >
                Continue Save
              </button>
            </div>
          </div>
        </div>
      )}
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
  const unitPriceHintId = `unit-price-readonly-${index}`;
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
            readOnly
            aria-describedby={unitPriceHintId}
            className={`${inputCls(!!errors.unit_price)} bg-slate-100 cursor-not-allowed`}
          />
          <p id={unitPriceHintId} className="sr-only">
            Unit price is read-only and follows the selected product price below.
          </p>
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

      {/* Fees */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Fees (PHP)</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(['dr_capitol', 'delivery_fee', 'passway', 'kulot'] as const).map((key, i) => (
            <Field key={key} label={['DR Capitol', 'Delivery Fee', 'Passway', 'Kulot'][i]}>
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
