import {
  ClipboardList,
  Loader2,
  Pencil,
  Trash2
} from 'lucide-react';
import type { CompanyEquipment, FuelBranch, FuelInventoryLedger, FuelPurchase } from '../../lib/database.types';
import { currency, equipmentBranchLabel, equipmentTypes, fmt, formatDate, formatDateTime, inputClass, isBackdated, movementBadge } from './fuelUtils';
import type { EquipmentFormState, FuelIssuanceWithTarget } from './types';
const chartColors = ['#10b981', '#38bdf8', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b'];

export function FormGuide({ tips }: { tips: string[]; }) {
  return (
    <details className="-mt-2 mb-4 text-xs text-slate-500">
      <summary className="cursor-pointer select-none font-medium text-emerald-700 hover:text-emerald-800">Quick tips</summary>
      <ul className="mt-2 list-disc space-y-1 pl-4">
        {tips.map(tip => <li key={tip}>{tip}</li>)}
      </ul>
    </details>
  );
}

export function EncodedNote({ transactionDate, createdAt, always = false }: { transactionDate: string; createdAt?: string | null; always?: boolean; }) {
  if (!createdAt) return null;
  const backdated = isBackdated(transactionDate, createdAt);
  if (!backdated && !always) return null;
  return (
    <p className={`text-[11px] font-medium ${backdated ? 'text-amber-600' : 'text-slate-400'}`} title={backdated ? 'Entry was encoded after its transaction date' : 'Encoded on'}>
      Encoded {formatDateTime(createdAt)}
    </p>
  );
}

export function ReversedBadge() {
  return <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">Reversed</span>;
}

export function DonutChart({ data }: { data: { label: string; value: number; }[]; }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const gradient = total > 0
    ? data.map((item, index) => {
      const start = cursor;
      const end = cursor + (item.value / total) * 100;
      cursor = end;
      return `${chartColors[index % chartColors.length]} ${start}% ${end}%`;
    }).join(', ')
    : '#e2e8f0 0% 100%';

  return (
    <div className="flex items-center gap-5 flex-wrap">
      <div className="relative w-36 h-36 rounded-full shrink-0" style={{ background: `conic-gradient(${gradient})` }}>
        <div className="absolute inset-8 rounded-full bg-white flex items-center justify-center text-center">
          <div>
            <p className="text-lg font-bold text-slate-800 tabular-nums">{fmt(total)}</p>
            <p className="text-xs text-slate-500">liters</p>
          </div>
        </div>
      </div>
      <div className="space-y-2 min-w-48 flex-1">
        {data.length === 0 ? (
          <p className="text-sm text-slate-500">No issuances this month</p>
        ) : data.map((item, index) => (
          <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: chartColors[index % chartColors.length] }} />
              <span className="text-slate-600 truncate">{item.label}</span>
            </span>
            <span className="font-semibold text-slate-800 tabular-nums">{fmt(item.value)} L</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode; }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

export function RecentIssuances({ rows, reversedIds, onViewAll }: { rows: FuelIssuanceWithTarget[]; reversedIds: Set<string>; onViewAll: () => void; }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800">Recent Fuel Issuances</h2>
        <button onClick={onViewAll} className="text-sm text-emerald-600 font-medium hover:text-emerald-700">View All</button>
      </div>
      <IssuancesTable rows={rows} reversedIds={reversedIds} compact />
    </div>
  );
}

export function RecentPurchases({ rows, reversedIds, onViewAll }: { rows: FuelPurchase[]; reversedIds: Set<string>; onViewAll: () => void; }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800">Recent Fuel Purchases</h2>
        <button onClick={onViewAll} className="text-sm text-emerald-600 font-medium hover:text-emerald-700">View All</button>
      </div>
      <PurchasesTable rows={rows} reversedIds={reversedIds} compact />
    </div>
  );
}

export function EditRowButton({ onClick, active }: { onClick: () => void; active: boolean; }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Edit"
      aria-label="Edit"
      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border transition-colors ${active ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
    >
      <Pencil size={13} />
    </button>
  );
}

export function PurchasesTable({ rows, reversedIds, compact = false, canPost = false, saving = false, onPost, canEdit = false, editingId, onEdit }: { rows: FuelPurchase[]; reversedIds?: Set<string>; compact?: boolean; canPost?: boolean; saving?: boolean; onPost?: (purchase: FuelPurchase) => void; canEdit?: boolean; editingId?: string; onEdit?: (purchase: FuelPurchase) => void; }) {
  const showEdit = canEdit && !compact && Boolean(onEdit);
  return (
    <div className={compact ? 'overflow-hidden' : 'bg-white rounded-xl border border-slate-200 overflow-hidden'}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
              <th className="px-5 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Supplier</th>
              <th className="px-4 py-3 text-left">Reference</th>
              <th className="px-4 py-3 text-right">Liters</th>
              <th className="px-4 py-3 text-right">Price / L</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-center">Expense</th>
              {showEdit && <th className="px-3 py-3"><span className="sr-only">Edit</span></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr><td colSpan={showEdit ? 8 : 7} className="px-4 py-12 text-center text-slate-400">No fuel purchases found</td></tr>
            ) : rows.map(item => (
              <tr key={item.id} className={`hover:bg-slate-50 ${reversedIds?.has(item.id) ? 'opacity-60' : ''}`}>
                <td className="px-5 py-3 whitespace-nowrap text-slate-600">
                  {formatDate(item.purchase_date)}
                  <EncodedNote transactionDate={item.purchase_date} createdAt={item.created_at} />
                </td>
                <td className="px-4 py-3 text-slate-800 font-medium">{item.supplier}</td>
                <td className="px-4 py-3 text-slate-500 font-mono text-xs">{item.reference_no || '—'}</td>
                <td className="px-4 py-3 text-right text-emerald-600 font-semibold tabular-nums">{fmt(item.liters)} L</td>
                <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{currency(item.unit_cost)}</td>
                <td className="px-4 py-3 text-right text-slate-800 font-bold tabular-nums">{currency(item.total_amount)}</td>
                <td className="px-4 py-3 text-center">
                  {reversedIds?.has(item.id) ? (
                    <ReversedBadge />
                  ) : item.expense_id ? (
                    <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">Expense Posted</span>
                  ) : canPost && !compact ? (
                    <button type="button" onClick={() => onPost?.(item)} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"><ClipboardList size={12} /> Post to Expenses</button>
                  ) : (
                    <span className="text-xs text-slate-400">Unposted</span>
                  )}
                </td>
                {showEdit && (
                  <td className="px-3 py-3 text-center">
                    {!reversedIds?.has(item.id) && <EditRowButton active={editingId === item.id} onClick={() => onEdit?.(item)} />}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function EquipmentTable({
  rows,
  branches,
  canManage,
  editingEquipment,
  editForm,
  setEditForm,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onDeactivate,
  saving,
}: {
  rows: CompanyEquipment[];
  branches: FuelBranch[];
  canManage: boolean;
  editingEquipment: CompanyEquipment | null;
  editForm: EquipmentFormState;
  setEditForm: React.Dispatch<React.SetStateAction<EquipmentFormState>>;
  onStartEdit: (item: CompanyEquipment) => void;
  onCancelEdit: () => void;
  onSubmitEdit: (event: React.FormEvent) => void;
  onDeactivate: (item: CompanyEquipment) => void;
  saving: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
              <th className="px-5 py-3 text-left">Equipment</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Code / Plate</th>
              <th className="px-4 py-3 text-left">Operator</th>
              <th className="px-4 py-3 text-left">Branch</th>
              {canManage && <th className="px-4 py-3 text-center w-24">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr><td colSpan={canManage ? 6 : 5} className="px-4 py-12 text-center text-slate-400">No company equipment found</td></tr>
            ) : rows.map(item => (
              editingEquipment?.id === item.id ? (
                <tr key={item.id} className="bg-blue-50/60">
                  <td className="px-5 py-3" colSpan={canManage ? 6 : 5}>
                    <form onSubmit={onSubmitEdit} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
                      <div className="md:col-span-2">
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Name</label>
                        <input required value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className={inputClass} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Type</label>
                        <select value={editForm.equipment_type} onChange={e => setEditForm(f => ({ ...f, equipment_type: e.target.value }))} className={inputClass}>
                          {equipmentTypes.map(type => <option key={type} value={type}>{type}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Code / Plate</label>
                        <input value={editForm.plate_or_code} onChange={e => setEditForm(f => ({ ...f, plate_or_code: e.target.value }))} className={inputClass} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Operator</label>
                        <input value={editForm.operator_name} onChange={e => setEditForm(f => ({ ...f, operator_name: e.target.value }))} className={inputClass} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Branch</label>
                        <select value={editForm.branch_id} onChange={e => setEditForm(f => ({ ...f, branch_id: e.target.value }))} className={inputClass}>
                          <option value="">All branches</option>
                          {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.company_name} - {branch.name}</option>)}
                        </select>
                      </div>
                      <div className="md:col-span-6 flex justify-end gap-2">
                        <button type="button" onClick={onCancelEdit} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50">Cancel</button>
                        <button type="submit" disabled={saving} className="px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold disabled:opacity-70">
                          {saving ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={item.id} className="hover:bg-slate-50 group">
                  <td className="px-5 py-3 text-slate-800 font-semibold">
                    {item.name}
                    {item.notes && <p className="text-xs text-slate-400 font-normal mt-0.5">{item.notes}</p>}
                  </td>
                  <td className="px-4 py-3"><span className="inline-flex px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200 text-xs font-semibold">{item.equipment_type}</span></td>
                  <td className="px-4 py-3 text-slate-600 font-mono text-xs">{item.plate_or_code || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{item.operator_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{equipmentBranchLabel(item, branches)}</td>
                  {canManage && (
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => onStartEdit(item)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit equipment">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => onDeactivate(item)} disabled={saving} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50" title="Deactivate equipment">
                          {saving ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function IssuancesTable({ rows, reversedIds, compact = false, canEdit = false, editingId, onEdit }: { rows: FuelIssuanceWithTarget[]; reversedIds?: Set<string>; compact?: boolean; canEdit?: boolean; editingId?: string; onEdit?: (issuance: FuelIssuanceWithTarget) => void; }) {
  const showEdit = canEdit && !compact && Boolean(onEdit);
  return (
    <div className={compact ? 'overflow-hidden' : 'bg-white rounded-xl border border-slate-200 overflow-hidden'}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
              <th className="px-5 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Category</th>
              <th className="px-4 py-3 text-left">Issued To</th>
              <th className="px-4 py-3 text-left">Reference</th>
              <th className="px-4 py-3 text-right">Liters</th>
              <th className="px-4 py-3 text-right">Price / L</th>
              <th className="px-4 py-3 text-right">Value</th>
              {showEdit && <th className="px-3 py-3"><span className="sr-only">Edit</span></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr><td colSpan={showEdit ? 8 : 7} className="px-4 py-12 text-center text-slate-400">No fuel issuances found</td></tr>
            ) : rows.map(item => (
              <tr key={item.id} className={`hover:bg-slate-50 ${reversedIds?.has(item.id) ? 'opacity-60' : ''}`}>
                <td className="px-5 py-3 whitespace-nowrap text-slate-600">
                  {formatDate(item.issuance_date)}
                  <EncodedNote transactionDate={item.issuance_date} createdAt={item.created_at} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold">{item.category}</span>
                    {reversedIds?.has(item.id) && <ReversedBadge />}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-800 font-medium">
                  {item.issued_to}
                  {item.trucks?.plate_number && <p className="text-xs text-slate-400 font-mono">{item.trucks.plate_number}</p>}
                  {item.company_equipment && <p className="text-xs text-slate-400">{item.company_equipment.equipment_type}{item.company_equipment.plate_or_code ? ` / ${item.company_equipment.plate_or_code}` : ''}</p>}
                </td>
                <td className="px-4 py-3 text-slate-500 font-mono text-xs">{item.reference_no || '—'}</td>
                <td className="px-4 py-3 text-right text-emerald-600 font-semibold tabular-nums">{fmt(item.liters)} L</td>
                <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{currency(item.unit_cost_snapshot)}</td>
                <td className="px-4 py-3 text-right text-slate-800 font-bold tabular-nums">{currency(item.total_value)}</td>
                {showEdit && (
                  <td className="px-3 py-3 text-center">
                    {!reversedIds?.has(item.id) && <EditRowButton active={editingId === item.id} onClick={() => onEdit?.(item)} />}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function HistoryTable({ rows, reversedLedgerIds, showEncoded = false, canAdjust, onReverse, saving }: { rows: FuelInventoryLedger[]; reversedLedgerIds: Set<string>; showEncoded?: boolean; canAdjust: boolean; onReverse: (item: FuelInventoryLedger) => void; saving: boolean; }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
              <th className="px-5 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Description</th>
              <th className="px-4 py-3 text-right">Liters</th>
              <th className="px-4 py-3 text-right">Value</th>
              <th className="px-4 py-3 text-right">Balance</th>
              {canAdjust && <th className="px-4 py-3 text-center">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr><td colSpan={canAdjust ? 7 : 6} className="px-4 py-12 text-center text-slate-400">No inventory movement found</td></tr>
            ) : rows.map(item => (
              <tr key={item.id} className={`hover:bg-slate-50 ${reversedLedgerIds.has(item.id) ? 'opacity-60' : ''}`}>
                <td className="px-5 py-3 whitespace-nowrap text-slate-600">
                  {formatDate(item.movement_date)}
                  <EncodedNote transactionDate={item.movement_date} createdAt={item.created_at} always={showEncoded} />
                </td>
                <td className="px-4 py-3"><span className={`inline-flex px-2.5 py-1 rounded-full border text-xs font-semibold ${movementBadge(item.movement_type)}`}>{item.movement_type.replace('_', ' ')}</span></td>
                <td className="px-4 py-3 text-slate-800 font-medium">
                  {item.description || '—'}
                  <p className="text-xs text-slate-400 font-mono">{item.reference_no || 'No reference'}</p>
                </td>
                <td className={`px-4 py-3 text-right font-semibold tabular-nums ${item.liters_delta >= 0 ? 'text-emerald-600' : 'text-orange-600'}`}>{fmt(item.liters_delta)} L</td>
                <td className={`px-4 py-3 text-right tabular-nums ${item.value_delta >= 0 ? 'text-slate-700' : 'text-orange-600'}`}>{currency(item.value_delta)}</td>
                <td className="px-4 py-3 text-right text-slate-800 font-bold tabular-nums whitespace-nowrap">
                  {fmt(item.balance_liters_after)} L
                  <p className="text-[11px] font-normal text-slate-400">from {fmt(Number(item.balance_liters_after) - Number(item.liters_delta))} L</p>
                </td>
                {canAdjust && (
                  <td className="px-4 py-3 text-center">
                    {reversedLedgerIds.has(item.id) ? (
                      <ReversedBadge />
                    ) : item.source_table === 'fuel_purchase_edits' || item.source_table === 'fuel_issuance_edits' ? (
                      <span className="text-xs text-slate-400" title="Edit correction. Reverse the original purchase/issuance instead.">Edit</span>
                    ) : item.movement_type !== 'REVERSAL' && !item.reversal_of_ledger_id ? (
                      <button disabled={saving} onClick={() => onReverse(item)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold disabled:opacity-60">
                        Reverse
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
