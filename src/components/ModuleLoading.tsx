import { Loader2 } from 'lucide-react';

export default function ModuleLoading({ overlay = false }: { overlay?: boolean; }) {
  const indicator = (
    <div role="status" className="flex items-center justify-center gap-2 rounded-xl bg-white p-8 text-sm text-slate-500">
      <Loader2 size={18} className="animate-spin" aria-hidden="true" />
      Loading module…
    </div>
  );
  return overlay
    ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">{indicator}</div>
    : indicator;
}
