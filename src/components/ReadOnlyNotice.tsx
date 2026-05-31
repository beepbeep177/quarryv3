import { ShieldAlert } from 'lucide-react';

export default function ReadOnlyNotice({ message }: { message?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <ShieldAlert size={18} className="mt-0.5 flex-shrink-0" />
      <p>{message ?? 'Your account is read-only. Ask a manager if you need record changes.'}</p>
    </div>
  );
}
