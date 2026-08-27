import type { PaymentMode, TransactionWithRelations } from './database.types';

export const SPLIT_PAYMENT_MODES = ['CASH', 'P.O', 'OFFSET', 'GCASH', 'BANK_TRANSFER', 'CUSTOMER_CREDIT'] as const;
export type SplitPaymentMode = (typeof SPLIT_PAYMENT_MODES)[number];

export const PAYMENT_MODES = [...SPLIT_PAYMENT_MODES, 'DONATION', 'SPLIT'] as const satisfies readonly PaymentMode[];

export function getSplitModeAmount(tx: TransactionWithRelations, mode: SplitPaymentMode) {
  if (!Array.isArray(tx.split_payment_details)) return 0;
  let total = 0;
  for (const detail of tx.split_payment_details as unknown[]) {
    if (!detail || typeof detail !== 'object' || Array.isArray(detail)) continue;
    const record = detail as Record<string, unknown>;
    const selectedMode = typeof record.mode === 'string' ? record.mode : '';
    const amount = typeof record.amount === 'number'
      ? record.amount
      : typeof record.amount === 'string'
        ? parseFloat(record.amount)
        : NaN;
    if (selectedMode === mode && Number.isFinite(amount) && amount >= 0) {
      total += amount;
    }
  }
  return total;
}

export function getPaymentModeAmount(tx: TransactionWithRelations, mode: SplitPaymentMode) {
  if (tx.payment_mode === mode) return tx.total_amount ?? 0;
  if (tx.payment_mode === 'SPLIT') return getSplitModeAmount(tx, mode);
  return 0;
}

export function getReceivableAmount(tx: TransactionWithRelations) {
  if (tx.payment_mode === 'P.O' || tx.payment_mode === 'OFFSET') {
    return roundCurrency(tx.total_amount ?? 0);
  }

  if (tx.payment_mode !== 'SPLIT') return 0;
  return roundCurrency(getSplitModeAmount(tx, 'P.O') + getSplitModeAmount(tx, 'OFFSET'));
}

export function getReceivableModeLabel(tx: TransactionWithRelations) {
  if (tx.payment_mode !== 'SPLIT') return tx.payment_mode;

  const modes = (['P.O', 'OFFSET'] as const).filter(mode => getSplitModeAmount(tx, mode) > 0);
  return modes.length > 0 ? `SPLIT: ${modes.join(' + ')}` : 'SPLIT';
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
