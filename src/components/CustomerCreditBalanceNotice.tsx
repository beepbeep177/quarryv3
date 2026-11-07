import { Wallet } from 'lucide-react';
import { customerCreditBalanceAfter } from '../lib/customerCredit';

interface CustomerCreditBalanceNoticeProps {
  customerName: string;
  balance: number;
  paymentAmount: number;
  loading: boolean;
  error: string | null;
}

const fmt = (value: number) => value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CustomerCreditBalanceNotice({ customerName, balance, paymentAmount, loading, error }: CustomerCreditBalanceNoticeProps) {
  const balanceAfter = customerCreditBalanceAfter(balance, paymentAmount);
  const negative = balance < 0 || balanceAfter < 0;
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${negative ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-100 bg-emerald-50 text-emerald-800'}`}>
      <div className="flex items-center gap-2">
        <Wallet size={16} />
        <span className="font-semibold">Customer Credit Balance for {customerName}:</span>
        <span className={`font-bold tabular-nums ${balance < 0 ? 'text-red-600' : ''}`}>{loading ? 'Loading...' : error ? 'Unavailable' : `PHP ${fmt(balance)}`}</span>
      </div>
      {error && <p className="text-xs mt-1 text-red-600">{error}</p>}
      {!loading && !error && paymentAmount > 0 && (
        <p className="text-xs mt-1">Balance after this entry: <span className={`font-bold tabular-nums ${balanceAfter < 0 ? 'text-red-600' : ''}`}>PHP {fmt(balanceAfter)}</span></p>
      )}
      {!loading && !error && balanceAfter < 0 && (
        <p className="text-xs mt-1">{paymentAmount > 0 ? 'This entry can still be saved. ' : ''}A negative balance means the customer owes this amount; future customer deposits will reduce the amount owed.</p>
      )}
    </div>
  );
}
