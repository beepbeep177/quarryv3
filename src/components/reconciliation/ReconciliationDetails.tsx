import { liters, peso, type DailyReconciliationResult } from '../../lib/reconciliation';

export default function ReconciliationDetails({ report }: { report: DailyReconciliationResult }) {
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-5"><h2 className="font-semibold text-slate-800">Fuel inventory by branch</h2><p className="mt-1 text-xs text-slate-500">Opening + net movements = closing, by transaction date. Backdated entries and later corrections can restate earlier dates. Source posting checks use the current versions of records dated {report.date}.</p></div>
        <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>{['Branch', 'Opening', 'Net movement', 'Closing', 'Inventory snapshot', 'Difference', 'Value difference'].map(label => <th key={label} className="px-4 py-3 text-left">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{report.fuel.branches.length === 0 ? <tr><td colSpan={7} className="p-6 text-center text-slate-500">No fuel branches found.</td></tr> : report.fuel.branches.map(branch => <tr key={branch.id}><td className="px-4 py-3 font-medium text-slate-700">{branch.name}</td><td className="px-4 py-3 tabular-nums">{liters(branch.opening_liters)}</td><td className="px-4 py-3 tabular-nums">{liters(branch.movement_liters)}</td><td className="px-4 py-3 font-semibold tabular-nums">{liters(branch.closing_liters)}</td><td className="px-4 py-3 tabular-nums">{!report.is_today ? 'Not compared' : branch.missing_state ? 'Missing' : liters(branch.state_liters ?? 0)}</td><td className={`px-4 py-3 tabular-nums ${Math.abs(branch.liters_difference ?? 0) > 0.005 ? 'font-semibold text-red-600' : ''}`}>{branch.liters_difference === null ? '—' : liters(branch.liters_difference)}</td><td className={`px-4 py-3 tabular-nums ${Math.abs(branch.value_difference ?? 0) > 0.005 ? 'font-semibold text-red-600' : ''}`}>{branch.value_difference === null ? '—' : peso(branch.value_difference)}</td></tr>)}</tbody>
        </table></div>
      </div>
      {(report.credit_issues.length > 0 || report.fuel.source_issues.length > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <h2 className="font-semibold">Source records to review</h2>
          <p className="mt-1 text-xs">Up to 50 records per category. IDs identify the source record for investigation; this screen does not change entries.</p>
          {report.credit_issues.map(issue => <p key={`${issue.source_table}-${issue.source_id}`} className="mt-3 break-words"><span className="font-semibold">Customer credit</span> · {issue.source_table} · <span className="font-mono text-xs">{issue.source_id}</span> · expected {peso(issue.expected)}, posted {peso(issue.posted)}</p>)}
          {report.fuel.source_issues.map(issue => <p key={`${issue.source_table}-${issue.id}`} className="mt-3 break-words"><span className="font-semibold">Fuel</span> · {issue.source_table} · <span className="font-mono text-xs">{issue.id}</span> · difference {liters(issue.liters_difference)} / {peso(issue.value_difference)}</p>)}
        </div>
      )}
    </div>
  );
}
