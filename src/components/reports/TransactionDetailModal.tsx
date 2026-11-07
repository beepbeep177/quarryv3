import {
  Pencil,
  X
} from 'lucide-react';
import type { TransactionWithRelations } from '../../lib/database.types';
import { DetailItem } from './ReportComponents';
import { fmt, formatDateLabel, formatTransactionTime, formatVolume } from './reportUtils';

interface TransactionDetailModalProps {
  selectedTransaction: TransactionWithRelations;
  canEditTransactions: boolean;
  onEditTransaction?: (transaction: TransactionWithRelations) => void;
  closeModal: () => void;
  editSelectedTransaction: () => void;
}

export default function TransactionDetailModal({ selectedTransaction, canEditTransactions, onEditTransaction, closeModal, editSelectedTransaction }: TransactionDetailModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={closeModal}
      />

      {/* Modal Content */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden mx-4">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="font-bold text-lg text-slate-800">Transaction Details</h3>
            <p className="text-sm text-slate-500 font-mono">{selectedTransaction.dr_number || 'No DR #'}</p>
          </div>
          <button
            onClick={closeModal}
            className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Status & Payment Mode Badges */}
          <div className="flex items-center gap-3 mb-6">
            <span className={`inline-flex px-3 py-1 rounded-full text-sm font-semibold border ${selectedTransaction.status === 'PAID'
              ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
              : 'bg-amber-50 text-amber-600 border-amber-200'
              }`}>
              {selectedTransaction.status}
            </span>
            <span className={`inline-flex px-3 py-1 rounded-full text-sm font-semibold ${selectedTransaction.payment_mode === 'CASH'
              ? 'bg-emerald-100 text-emerald-700'
              : selectedTransaction.payment_mode === 'P.O'
                ? 'bg-amber-100 text-amber-700'
                : selectedTransaction.payment_mode === 'GCASH'
                  ? 'bg-blue-100 text-blue-700'
                  : selectedTransaction.payment_mode === 'BANK_TRANSFER'
                    ? 'bg-violet-100 text-violet-700'
                    : selectedTransaction.payment_mode === 'CUSTOMER_CREDIT'
                      ? 'bg-teal-100 text-teal-700'
                      : selectedTransaction.payment_mode === 'OFFSET'
                        ? 'bg-pink-100 text-pink-700'
                        : selectedTransaction.payment_mode === 'DONATION'
                          ? 'bg-rose-100 text-rose-700'
                          : selectedTransaction.payment_mode === 'SPLIT'
                            ? 'bg-cyan-100 text-cyan-700'
                            : 'bg-slate-100 text-slate-600'
              }`}>
              {selectedTransaction.payment_mode === 'BANK_TRANSFER'
                ? 'BANK TRANSFER'
                : selectedTransaction.payment_mode === 'CUSTOMER_CREDIT'
                  ? 'CUSTOMER CREDIT'
                  : selectedTransaction.payment_mode}
            </span>
          </div>

          {/* Basic Info Section */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <DetailItem
              label="Transaction Date"
              value={formatDateLabel(selectedTransaction.transaction_date, {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
              })}
            />
            <DetailItem
              label="Captured Time"
              value={formatTransactionTime(selectedTransaction.transaction_time)}
            />
            <DetailItem
              label="DR Number"
              value={selectedTransaction.dr_number || '—'}
              mono
            />
            <DetailItem
              label="Customer"
              value={selectedTransaction.customers?.name ?? '—'}
            />
            <DetailItem
              label="Truck"
              value={selectedTransaction.trucks?.plate_number ?? '—'}
              mono
            />
            <DetailItem
              label="Material Type"
              value={selectedTransaction.material_type || '—'}
            />
          </div>

          <hr className="border-slate-200 my-5" />

          {/* Dimensions Section */}
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Dimensions</h4>
          <div className="grid grid-cols-4 gap-4 mb-6">
            <DetailItem label="Length" value={`${selectedTransaction.length_cm ?? 0} cm`} />
            <DetailItem label="Width" value={`${selectedTransaction.width_cm ?? 0} cm`} />
            <DetailItem label="Height" value={`${selectedTransaction.height_cm ?? 0} cm`} />
            <DetailItem
              label="Volume"
              value={`${formatVolume(selectedTransaction.volume_m3 ?? 0)} m³`}
              highlight
            />
          </div>

          <hr className="border-slate-200 my-5" />

          {/* Pricing Section */}
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Pricing Breakdown</h4>
          <div className="bg-slate-50 rounded-xl p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Unit Price</span>
              <span className="text-slate-700 font-medium tabular-nums">₱{fmt(selectedTransaction.unit_price ?? 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Base Amount (Volume × Unit Price)</span>
              <span className="text-slate-700 font-medium tabular-nums">₱{fmt(selectedTransaction.amount ?? 0)}</span>
            </div>

            <hr className="border-slate-200" />

            <div className="flex justify-between text-sm">
              <span className="text-slate-500">DR Capitol</span>
              <span className="text-slate-700 tabular-nums">₱{fmt(selectedTransaction.dr_capitol ?? 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Delivery Fee</span>
              <span className="text-slate-700 tabular-nums">₱{fmt(selectedTransaction.delivery_fee ?? 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Passway</span>
              <span className="text-slate-700 tabular-nums">₱{fmt(selectedTransaction.passway ?? 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Kulot</span>
              <span className="text-slate-700 tabular-nums">₱{fmt(selectedTransaction.kulot ?? 0)}</span>
            </div>

            <hr className="border-slate-200" />

            <div className="flex justify-between text-base font-bold">
              <span className="text-slate-700">Total Amount</span>
              <span className="text-emerald-600 tabular-nums">₱{fmt(selectedTransaction.total_amount ?? 0)}</span>
            </div>
          </div>

          {/* Notes Section */}
          {selectedTransaction.notes && (
            <>
              <hr className="border-slate-200 my-5" />
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Notes</h4>
              <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3">
                {selectedTransaction.notes}
              </p>
            </>
          )}

          {/* Metadata */}
          <hr className="border-slate-200 my-5" />
          <p className="text-xs text-slate-400">
            Created: {selectedTransaction.created_at
              ? new Date(selectedTransaction.created_at).toLocaleString('en-PH', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })
              : '—'}
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
          {canEditTransactions && onEditTransaction && (
            <button
              onClick={editSelectedTransaction}
              className="px-4 py-2 text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors flex items-center gap-2"
            >
              <Pencil size={15} />
              Edit Transaction
            </button>
          )}
          <button
            onClick={closeModal}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
