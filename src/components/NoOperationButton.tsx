import { useRef, useState } from 'react';
import { Ban, Loader2 } from 'lucide-react';
import ActionModal from './ActionModal';
import type { OperationsModuleKey } from '../lib/operationsDashboard';
import { markNoOperation, operationsModuleLabel } from '../lib/noOperation';

function formatDateLabel(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface NoOperationButtonProps {
  module: OperationsModuleKey;
  date: string;
  onDone: () => void | Promise<void>;
  onError: (message: string) => void;
  compact?: boolean;
  disabled?: boolean;
}

/** Tags a day as "No Operation" for one module, after a confirmation. */
export default function NoOperationButton({ module, date, onDone, onError, compact = false, disabled = false }: NoOperationButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const label = operationsModuleLabel(module);

  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      const message = await markNoOperation(module, date);
      setConfirming(false);
      if (message) onError(message);
      else await onDone();
    } finally {
      setSaving(false);
      inFlight.current = false;
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled || saving || !date}
        onClick={() => setConfirming(true)}
        title="Use when there was no operation on this date"
        className={compact
          ? 'inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50'
          : 'flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60'}
      >
        {saving ? <Loader2 size={compact ? 13 : 16} className="animate-spin" /> : <Ban size={compact ? 13 : 16} />}
        Mark No Operation
      </button>
      <ActionModal
        open={confirming}
        title="Mark as No Operation"
        description={`Record ${formatDateLabel(date)} as a day with no ${label} operation. All figures will be saved as zero.`}
        variant="info"
        confirmLabel="Mark No Operation"
        loading={saving}
        onClose={() => setConfirming(false)}
        onConfirm={confirm}
      >
        <p className="text-xs text-slate-500">You can still edit this entry later if there was operation after all.</p>
      </ActionModal>
    </>
  );
}
