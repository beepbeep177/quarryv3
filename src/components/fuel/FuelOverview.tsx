import {
  ArrowDownCircle,
  ArrowUpCircle,
  Database,
  Fuel,
  History,
  Plus,
  Truck
} from 'lucide-react';
import type { FuelPurchase } from '../../lib/database.types';
import { DonutChart, RecentIssuances, RecentPurchases } from './FuelTables';
import { currency, fmt } from './fuelUtils';
import type { FuelIssuanceWithTarget, FuelReversals, FuelTab } from './types';

interface FuelOverviewProps {
  activeTab: FuelTab;
  summary: { currentLiters: number; inventoryValue: number; averageCost: number; purchasedThisMonth: number; purchaseCostThisMonth: number; issuedThisMonth: number; issuedValueThisMonth: number; };
  issuances: FuelIssuanceWithTarget[];
  reversal: FuelReversals;
  setActiveTab: React.Dispatch<React.SetStateAction<FuelTab>>;
  purchases: FuelPurchase[];
  canAddPurchase: boolean;
  canIssue: boolean;
  categoryChartData: { label: string; value: number; }[];
}

export default function FuelOverview({
  activeTab,
  summary,
  issuances,
  reversal,
  setActiveTab,
  purchases,
  canAddPurchase,
  canIssue,
  categoryChartData
}: FuelOverviewProps) {
  return (<>
    {activeTab === 'overview' && (
      <div className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: 'Current Fuel Inventory', value: `${fmt(summary.currentLiters)} L`, sub: `Value: ${currency(summary.inventoryValue)}`, icon: <Fuel size={22} className="text-emerald-500" />, bg: 'bg-emerald-50' },
            { label: 'Purchased This Month', value: `${fmt(summary.purchasedThisMonth)} L`, sub: `Total cost: ${currency(summary.purchaseCostThisMonth)}`, icon: <ArrowDownCircle size={22} className="text-sky-500" />, bg: 'bg-sky-50' },
            { label: 'Issued This Month', value: `${fmt(summary.issuedThisMonth)} L`, sub: `Total value: ${currency(summary.issuedValueThisMonth)}`, icon: <ArrowUpCircle size={22} className="text-orange-500" />, bg: 'bg-orange-50' },
            { label: 'Average Cost', value: `${currency(summary.averageCost)} / L`, sub: 'Weighted average', icon: <Database size={22} className="text-violet-500" />, bg: 'bg-violet-50' },
          ].map(card => (
            <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className={`w-11 h-11 rounded-xl ${card.bg} flex items-center justify-center mb-4`}>
                {card.icon}
              </div>
              <p className="text-sm text-slate-500 font-medium">{card.label}</p>
              <p className="text-2xl font-bold text-slate-800 mt-1 tabular-nums">{card.value}</p>
              <p className="text-xs text-slate-400 mt-1">{card.sub}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-5">
            <RecentIssuances rows={issuances.slice(0, 5)} reversedIds={reversal.reversedSourceIds} onViewAll={() => setActiveTab('issuances')} />
            <RecentPurchases rows={purchases.slice(0, 5)} reversedIds={reversal.reversedSourceIds} onViewAll={() => setActiveTab('purchases')} />
          </div>
          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="font-semibold text-slate-800 mb-4">Quick Actions</h2>
              <div className="space-y-2">
                {canAddPurchase && <button onClick={() => setActiveTab('purchases')} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold"><Plus size={15} /> Add Fuel Purchase</button>}
                {canIssue && <button onClick={() => setActiveTab('issuances')} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm font-semibold"><Truck size={15} /> Issue Fuel</button>}
                <button onClick={() => setActiveTab('history')} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold"><History size={15} /> View Inventory History</button>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="font-semibold text-slate-800 mb-4">Fuel Issuance by Category</h2>
              <DonutChart data={categoryChartData} />
            </div>
          </div>
        </div>
      </div>
    )}
  </>);
}
