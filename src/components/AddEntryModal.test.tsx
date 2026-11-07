import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TransactionWithRelations } from '../lib/database.types';
import AddEntryModal from './AddEntryModal';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

function renderEntry(overrides: Partial<TransactionWithRelations> = {}) {
  const transaction = {
    id: 'transaction-id', customer_id: 'customer-id', truck_id: 'truck-id',
    transaction_date: '2026-10-19', transaction_time: '12:00:00',
    payment_mode: 'CASH', status: 'PAID', dr_number: 'TEST-1', material_type: '3/4',
    length_cm: 100, width_cm: 100, height_cm: 100, unit_price: 1000,
    dr_capitol: 0, delivery_fee: 0, passway: 0, kulot: 0, notes: '',
    split_payment_details: [], attachment_urls: [], ...overrides,
  } as TransactionWithRelations;
  return renderToStaticMarkup(<AddEntryModal transaction={transaction} onClose={() => {}} onSuccess={() => {}} />);
}

describe('customer credit selection without a funded balance', () => {
  it('keeps full customer credit selectable at zero balance', () => {
    const option = renderEntry().match(/<option[^>]*value="CUSTOMER_CREDIT"[^>]*>/)?.[0];
    expect(option).toBeDefined();
    expect(option).not.toContain('disabled');
  });
  it('keeps the split customer credit option selectable at zero balance', () => {
    const html = renderEntry({ payment_mode: 'SPLIT' });
    const button = html.match(/<button[^>]*>CREDIT<\/button>/)?.[0];
    expect(button).toBeDefined();
    expect(button).not.toContain('disabled');
  });
  it('does not cap a split credit amount at the customer balance', () => {
    const html = renderEntry({ payment_mode: 'SPLIT', split_payment_details: [{ mode: 'CASH', amount: 200 }, { mode: 'CUSTOMER_CREDIT', amount: 800 }] });
    const input = html.match(/<input[^>]*value="800"[^>]*>/)?.[0];
    expect(input).toBeDefined();
    expect(input).not.toContain('max=');
  });
});
