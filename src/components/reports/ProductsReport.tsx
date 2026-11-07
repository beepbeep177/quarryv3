import {
  DollarSign,
  FileBarChart2,
  Layers,
  Package,
  RefreshCw
} from 'lucide-react';
import Pagination from '../Pagination';
import { PieChart } from './ReportComponents';
import { REPORT_PAGE_SIZE, fmt, formatVolume } from './reportUtils';
import type { ReportsData } from './useReportsData';

export default function ProductsReport({ data }: { data: ReportsData; }) {
  const {
    setProductsPage,
    loading,
    productSalesList,
    productTotals,
    productChartData,
    productsCurrentPage,
    pagedProductSales
  } = data;
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Top Product', value: productSalesList[0]?.materialType ?? '—', icon: <Package size={18} className="text-emerald-500" />, bg: 'bg-emerald-50' },
          { label: 'Quantity Sold', value: String(productTotals.quantity), icon: <Layers size={18} className="text-sky-500" />, bg: 'bg-sky-50' },
          { label: 'Products Sold', value: String(productSalesList.length), icon: <FileBarChart2 size={18} className="text-violet-500" />, bg: 'bg-violet-50' },
          { label: 'Revenue', value: `₱${fmt(productTotals.revenue)}`, icon: <DollarSign size={18} className="text-amber-500" />, bg: 'bg-amber-50' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>{card.icon}</div>
            <p className="text-xs text-slate-500 font-medium">{card.label}</p>
            <p className="text-lg font-bold text-slate-800 mt-0.5 tabular-nums truncate">{loading ? '—' : card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <div className="mb-4">
            <h2 className="font-semibold text-slate-800">Product Distribution</h2>
            <p className="text-xs text-slate-500 mt-1">By quantity sold</p>
          </div>
          {loading ? (
            <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
              <RefreshCw size={16} className="animate-spin" /> Loading product sales...
            </div>
          ) : productSalesList.length === 0 ? (
            <div className="py-16 text-center">
              <Package size={32} className="text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No data available</p>
            </div>
          ) : (
            <PieChart data={productChartData} />
          )}
        </div>

        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Product Sales Table</h2>
          </div>
          {loading ? (
            <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
              <RefreshCw size={16} className="animate-spin" /> Loading product sales...
            </div>
          ) : productSalesList.length === 0 ? (
            <div className="py-16 text-center">
              <Package size={32} className="text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No product sales in selected range</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">Product</th>
                    <th className="px-4 py-3 text-right">Quantity Sold</th>
                    <th className="px-4 py-3 text-right">Volume (m³)</th>
                    <th className="px-4 py-3 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedProductSales.map(product => (
                    <tr key={product.materialType} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-700">{product.materialType}</td>
                      <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{product.quantity}</td>
                      <td className="px-4 py-3 text-right text-emerald-600 font-semibold tabular-nums">{formatVolume(product.volume)}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800 tabular-nums">₱{fmt(product.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900">
                    <td className="px-4 py-3 text-slate-300 font-semibold text-xs uppercase">Totals</td>
                    <td className="px-4 py-3 text-right text-slate-300 font-semibold tabular-nums">{productTotals.quantity}</td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-bold tabular-nums">{formatVolume(productTotals.volume)}</td>
                    <td className="px-4 py-3 text-right text-white font-bold tabular-nums">₱{fmt(productTotals.revenue)}</td>
                  </tr>
                </tfoot>
              </table>
              <Pagination page={productsCurrentPage} pageSize={REPORT_PAGE_SIZE} totalItems={productSalesList.length} onPageChange={setProductsPage} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
