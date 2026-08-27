import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, Trash2, X } from 'lucide-react';

type ActionModalVariant = 'danger' | 'warning' | 'info' | 'success';

interface ActionModalProps {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  variant?: ActionModalVariant;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  showCancel?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

const tone = {
  danger: {
    iconWrap: 'bg-red-50 text-red-600',
    confirm: 'bg-red-600 hover:bg-red-700 text-white shadow-sm',
    icon: Trash2,
  },
  warning: {
    iconWrap: 'bg-amber-50 text-amber-600',
    confirm: 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm',
    icon: AlertTriangle,
  },
  info: {
    iconWrap: 'bg-sky-50 text-sky-600',
    confirm: 'bg-slate-900 hover:bg-slate-800 text-white shadow-sm',
    icon: Info,
  },
  success: {
    iconWrap: 'bg-emerald-50 text-emerald-600',
    confirm: 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm',
    icon: CheckCircle2,
  },
};

export default function ActionModal({
  open,
  title,
  description,
  children,
  variant = 'danger',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  loading = false,
  showCancel = true,
  onConfirm,
  onClose,
}: ActionModalProps) {
  if (!open) return null;

  const currentTone = tone[variant];
  const Icon = currentTone.icon;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 px-4 py-6 backdrop-blur-sm"
      onClick={() => {
        if (!loading) onClose();
      }}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${currentTone.iconWrap}`}>
            <Icon size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-slate-800">{title}</h2>
            {description && <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        {children && <div className="px-5 py-5">{children}</div>}

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
          {showCancel && (
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${currentTone.confirm}`}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Icon size={15} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
