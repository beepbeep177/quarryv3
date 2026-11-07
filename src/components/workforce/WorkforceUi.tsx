import type { ReactNode } from 'react';
import { AlertTriangle, Loader2, RefreshCw, X } from 'lucide-react';

export function PageHeader({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
      <div>
        <h1 className="mt-1 text-2xl font-bold text-slate-800">{title}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function ToolbarButton({ icon, label, onClick, disabled, tone = 'plain', type = 'button', spinning }: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  tone?: 'plain' | 'primary' | 'danger' | 'warning';
  type?: 'button' | 'submit';
  spinning?: boolean;
}) {
  const toneClass = {
    plain: 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
    primary: 'bg-emerald-500 text-white shadow-sm shadow-emerald-200 hover:bg-emerald-600',
    danger: 'border border-red-200 bg-white text-red-600 hover:bg-red-50',
    warning: 'bg-amber-500 text-white hover:bg-amber-600',
  }[tone];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${toneClass}`}
    >
      {spinning ? <Loader2 size={16} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}

export function RefreshButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return <ToolbarButton icon={<RefreshCw size={16} className={loading ? 'animate-spin' : ''} />} label="Refresh" onClick={onClick} disabled={loading} />;
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{message}</div>;
}

export function SuccessBanner({ message }: { message: string }) {
  if (!message) return null;
  return <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{message}</div>;
}

export function WarningNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function Card({ title, subtitle, actions, children }: { title?: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            {title && <h2 className="text-lg font-bold text-slate-800">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function Field({ label, helper, children }: { label: string; helper?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        {helper && <span className="text-xs font-medium text-slate-400">{helper}</span>}
      </span>
      {children}
    </label>
  );
}

export function Badge({ tone, children, title }: { tone: 'emerald' | 'amber' | 'red' | 'slate' | 'sky' | 'violet'; children: ReactNode; title?: string }) {
  const toneClass = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    slate: 'border-slate-200 bg-slate-50 text-slate-600',
    sky: 'border-sky-200 bg-sky-50 text-sky-700',
    violet: 'border-violet-200 bg-violet-50 text-violet-700',
  }[tone];
  return <span title={title} className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${toneClass}`}>{children}</span>;
}

export function LoadingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
      <Loader2 size={16} className="animate-spin" />
      {label}
    </div>
  );
}

export function EmptyState({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return (
    <div className="py-16 text-center">
      <div className="mx-auto mb-3 flex justify-center text-slate-300">{icon}</div>
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      <p className="mt-1 text-xs text-slate-400">{detail}</p>
    </div>
  );
}

/** Centered form dialog (ActionModal is for confirmations). */
export function FormModal({ open, title, subtitle, onClose, children, footer, wide }: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 px-4 py-6 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-full w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl`}
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-800">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">{footer}</div>
      </div>
    </div>
  );
}

export function StatCard({ label, value, detail, tone = 'slate' }: { label: string; value: string; detail?: string; tone?: 'emerald' | 'amber' | 'sky' | 'slate' | 'violet' }) {
  const toneClass = {
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    sky: 'text-sky-600',
    slate: 'text-slate-800',
    violet: 'text-violet-600',
  }[tone];
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="truncate text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${toneClass}`}>{value}</p>
      {detail && <p className="mt-0.5 truncate text-xs text-slate-400">{detail}</p>}
    </div>
  );
}
