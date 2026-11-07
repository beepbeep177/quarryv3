import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Customer, ExpenseWithCategory, PaymentMode, TransactionWithRelations } from '../../lib/database.types';
import { fetchAllPages } from '../../lib/fetchAll';
import { paginate } from '../../lib/pagination';
import { getPaymentModeAmount } from '../../lib/payment';
import { supabase } from '../../lib/supabase';
import { type ExpenseLedgerFilterState } from '../ExpensesLedger';
import { REPORT_PAGE_SIZE, addDays, compactFinancialLineItems, createContinuousBuckets, formatHourBucket, getBucketStart, getDateRangeSummary, parseTransactionHour, reportDeliveryFeesAmount, reportDrFeesAmount, reportExcludedFeesAmount, reportNetSalesAmount, toInputDate, toMonthInput } from './reportUtils';
import type { CustomerSalesSummary, ExpenseSummaryRow, ExtraFeeFilter, Grouping, HourlyKpiSummary, NetIncomeSummary, PeriodMode, ProductSalesSummary, ReportTab, SalesSummary } from './types';

export function useReportsData(initialTab: ReportTab = 'sales', refreshKey = 0) {
  const today = useMemo(() => toInputDate(new Date()), []);

  const defaultFrom = useMemo(() => addDays(today, -6), [today]);

  const currentMonth = useMemo(() => toMonthInput(new Date()), []);

  const currentYear = useMemo(() => String(new Date().getFullYear()), []);

  const [activeTab, setActiveTab] = useState<ReportTab>(initialTab);

  const [periodMode, setPeriodMode] = useState<PeriodMode>('CUSTOM');

  const [dateFrom, setDateFrom] = useState(defaultFrom);

  const [dateTo, setDateTo] = useState(today);

  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const [selectedYear, setSelectedYear] = useState(currentYear);

  const [customerId, setCustomerId] = useState<'ALL' | string>('ALL');

  const [paymentModeFilter, setPaymentModeFilter] = useState<'ALL' | PaymentMode>('ALL');

  const [materialTypeFilter, setMaterialTypeFilter] = useState<'ALL' | string>('ALL');

  const [extraFeeFilter, setExtraFeeFilter] = useState<ExtraFeeFilter>('ALL');

  const [customerGrouping, setCustomerGrouping] = useState<Grouping>('WEEK');

  const [expenseGrouping, setExpenseGrouping] = useState<Grouping>('DAY');

  const [netGrouping, setNetGrouping] = useState<Grouping>('WEEK');

  const [salesPage, setSalesPage] = useState(1);

  const [customerSummaryPage, setCustomerSummaryPage] = useState(1);

  const [customerTransactionsPage, setCustomerTransactionsPage] = useState(1);

  const [expenseSummaryPage, setExpenseSummaryPage] = useState(1);

  const [expenseCategoryPage, setExpenseCategoryPage] = useState(1);

  const [productsPage, setProductsPage] = useState(1);

  const [transactions, setTransactions] = useState<TransactionWithRelations[]>([]);

  const [expenses, setExpenses] = useState<ExpenseWithCategory[]>([]);

  const [expenseLedgerFilter, setExpenseLedgerFilter] = useState<ExpenseLedgerFilterState | null>(null);

  const [customers, setCustomers] = useState<Customer[]>([]);

  const [loading, setLoading] = useState(true);

  const [customerLoading, setCustomerLoading] = useState(true);

  const [error, setError] = useState('');

  const [selectedTransaction, setSelectedTransaction] = useState<TransactionWithRelations | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);

  const [infoModal, setInfoModal] = useState('');

  const range = useMemo(
    () => getDateRangeSummary(periodMode, dateFrom, dateTo, selectedMonth, selectedYear),
    [periodMode, dateFrom, dateTo, selectedMonth, selectedYear]
  );

  const yearOptions = useMemo(() => {
    const current = Number(currentYear);
    return Array.from({ length: 8 }, (_, index) => String(current - index));
  }, [currentYear]);

  const fetchCustomers = useCallback(async () => {
    setCustomerLoading(true);
    const result = await fetchAllPages<Customer>(async (from, to) => {
      const page = await supabase.from('customers').select('*').order('name', { ascending: true }).range(from, to);
      return { data: page.data as Customer[] | null, error: page.error };
    });
    setCustomers(result.data);
    setCustomerLoading(false);
  }, []);

  const fetchReportData = useCallback(async () => {
    setLoading(true);
    setError('');

    const [transactionResult, expenseResult] = await Promise.all([
      fetchAllPages<TransactionWithRelations>(async (from, to) => {
        const page = await supabase
          .from('transactions')
          .select('*, customers(*), trucks(*)')
          .gte('transaction_date', range.start)
          .lte('transaction_date', range.end)
          .order('transaction_date', { ascending: false })
          .order('transaction_time', { ascending: false })
          .order('created_at', { ascending: false })
          .range(from, to);
        return { data: page.data as TransactionWithRelations[] | null, error: page.error };
      }),
      fetchAllPages<ExpenseWithCategory>(async (from, to) => {
        const page = await supabase
          .from('expenses')
          .select('*, expense_categories(*)')
          .gte('expense_date', range.start)
          .lte('expense_date', range.end)
          .order('expense_date', { ascending: false })
          .order('created_at', { ascending: false })
          .range(from, to);
        return { data: page.data as ExpenseWithCategory[] | null, error: page.error };
      }),
    ]);

    if (transactionResult.error || expenseResult.error) {
      const messages = [
        transactionResult.error ? `Transactions: ${transactionResult.error.message}` : null,
        expenseResult.error ? `Expenses: ${expenseResult.error.message}` : null,
      ].filter(Boolean);
      setError(messages.join(' • ') || 'Unable to load report data.');
    }

    setTransactions(transactionResult.data);
    setExpenses(expenseResult.data);
    setLoading(false);
  }, [range.end, range.start]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData, refreshKey]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setSalesPage(1);
    setCustomerSummaryPage(1);
    setCustomerTransactionsPage(1);
    setExpenseSummaryPage(1);
    setExpenseCategoryPage(1);
    setProductsPage(1);
  }, [activeTab, range.start, range.end, customerId, paymentModeFilter, materialTypeFilter, extraFeeFilter, customerGrouping, expenseGrouping, netGrouping]);

  const salesSummaryList = useMemo(() => {
    const bucketMap: Record<string, SalesSummary> = {};

    transactions.forEach(tx => {
      const bucketStart = getBucketStart(tx.transaction_date, range.salesGrouping);
      if (!bucketMap[bucketStart]) {
        bucketMap[bucketStart] = { bucketStart, count: 0, volume: 0, cash: 0, po: 0, offset: 0, gcash: 0, bankTransfer: 0, customerCredit: 0, drFees: 0, deliveryFees: 0, extraFees: 0, total: 0 };
      }

      bucketMap[bucketStart].count += 1;
      bucketMap[bucketStart].volume += tx.volume_m3 ?? 0;
      // Net sales includes DR fees; delivery, Passway, and Kulot are excluded.
      bucketMap[bucketStart].total += reportNetSalesAmount(tx);
      bucketMap[bucketStart].drFees += reportDrFeesAmount(tx);
      bucketMap[bucketStart].deliveryFees += reportDeliveryFeesAmount(tx);
      bucketMap[bucketStart].extraFees += reportExcludedFeesAmount(tx);

      bucketMap[bucketStart].cash += getPaymentModeAmount(tx, 'CASH');
      bucketMap[bucketStart].po += getPaymentModeAmount(tx, 'P.O');
      bucketMap[bucketStart].offset += getPaymentModeAmount(tx, 'OFFSET');
      bucketMap[bucketStart].gcash += getPaymentModeAmount(tx, 'GCASH');
      bucketMap[bucketStart].bankTransfer += getPaymentModeAmount(tx, 'BANK_TRANSFER');
      bucketMap[bucketStart].customerCredit += getPaymentModeAmount(tx, 'CUSTOMER_CREDIT');
    });

    return Object.values(bucketMap).sort((a, b) => b.bucketStart.localeCompare(a.bucketStart));
  }, [transactions, range.salesGrouping]);

  const grandNetSales = useMemo(() => transactions.reduce((sum, tx) => sum + reportNetSalesAmount(tx), 0), [transactions]);

  const grandDrFees = useMemo(() => transactions.reduce((sum, tx) => sum + reportDrFeesAmount(tx), 0), [transactions]);

  const grandDeliveryFees = useMemo(() => transactions.reduce((sum, tx) => sum + reportDeliveryFeesAmount(tx), 0), [transactions]);

  const grandExtraFees = useMemo(() => transactions.reduce((sum, tx) => sum + reportExcludedFeesAmount(tx), 0), [transactions]);

  const grandVolume = useMemo(() => transactions.reduce((sum, tx) => sum + (tx.volume_m3 ?? 0), 0), [transactions]);

  const cashTotal = useMemo(() => transactions.reduce((sum, tx) => sum + getPaymentModeAmount(tx, 'CASH'), 0), [transactions]);

  const poTotal = useMemo(() => transactions.reduce((sum, tx) => sum + getPaymentModeAmount(tx, 'P.O'), 0), [transactions]);

  const offsetTotal = useMemo(() => transactions.reduce((sum, tx) => sum + getPaymentModeAmount(tx, 'OFFSET'), 0), [transactions]);

  const gcashTotal = useMemo(() => transactions.reduce((sum, tx) => sum + getPaymentModeAmount(tx, 'GCASH'), 0), [transactions]);

  const bankTransferTotal = useMemo(() => transactions.reduce((sum, tx) => sum + getPaymentModeAmount(tx, 'BANK_TRANSFER'), 0), [transactions]);

  const customerCreditTotal = useMemo(() => transactions.reduce((sum, tx) => sum + getPaymentModeAmount(tx, 'CUSTOMER_CREDIT'), 0), [transactions]);

  const hourlyKpiList = useMemo(() => {
    const buckets: HourlyKpiSummary[] = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: formatHourBucket(hour),
      count: 0,
      volume: 0,
      netSales: 0,
      cash: 0,
      po: 0,
      offset: 0,
      gcash: 0,
      bankTransfer: 0,
      customerCredit: 0,
    }));

    transactions.forEach(tx => {
      const bucket = buckets[parseTransactionHour(tx.transaction_time)];
      bucket.count += 1;
      bucket.volume += tx.volume_m3 ?? 0;
      bucket.netSales += reportNetSalesAmount(tx);
      bucket.cash += getPaymentModeAmount(tx, 'CASH');
      bucket.po += getPaymentModeAmount(tx, 'P.O');
      bucket.offset += getPaymentModeAmount(tx, 'OFFSET');
      bucket.gcash += getPaymentModeAmount(tx, 'GCASH');
      bucket.bankTransfer += getPaymentModeAmount(tx, 'BANK_TRANSFER');
      bucket.customerCredit += getPaymentModeAmount(tx, 'CUSTOMER_CREDIT');
    });

    return buckets.filter(bucket => bucket.count > 0);
  }, [transactions]);

  const peakHour = useMemo(() => (
    hourlyKpiList.reduce<HourlyKpiSummary | null>((peak, bucket) => {
      if (!peak) return bucket;
      if (bucket.count > peak.count) return bucket;
      if (bucket.count === peak.count && bucket.netSales > peak.netSales) return bucket;
      return peak;
    }, null)
  ), [hourlyKpiList]);

  const averageTransactionsPerActiveHour = useMemo(() => (
    hourlyKpiList.length > 0 ? transactions.length / hourlyKpiList.length : 0
  ), [hourlyKpiList.length, transactions.length]);

  const expenseSummaryList = useMemo(() => {
    const bucketMap: Record<string, ExpenseSummaryRow> = {};

    expenses.forEach(expense => {
      const bucketStart = getBucketStart(expense.expense_date, expenseGrouping);
      if (!bucketMap[bucketStart]) {
        bucketMap[bucketStart] = { bucketStart, count: 0, total: 0, byCategory: {} };
      }
      bucketMap[bucketStart].count += 1;
      bucketMap[bucketStart].total += expense.amount ?? 0;
      const catName = expense.expense_categories?.name ?? 'Uncategorized';
      bucketMap[bucketStart].byCategory[catName] = (bucketMap[bucketStart].byCategory[catName] ?? 0) + (expense.amount ?? 0);
    });

    return Object.values(bucketMap).sort((a, b) => b.bucketStart.localeCompare(a.bucketStart));
  }, [expenses, expenseGrouping]);

  const totalExpenseRecords = useMemo(() => expenses.length, [expenses]);

  const expenseCategoryTotals = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach(expense => {
      const catName = expense.expense_categories?.name ?? 'Uncategorized';
      map[catName] = (map[catName] ?? 0) + (expense.amount ?? 0);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const topExpenseCategory = expenseCategoryTotals[0]?.[0] ?? '—';

  const topExpenseCategoryAmount = expenseCategoryTotals[0]?.[1] ?? 0;

  const materialTypeOptions = useMemo(() => {
    const types = new Set(transactions.map(tx => tx.material_type).filter(Boolean));
    return Array.from(types).sort();
  }, [transactions]);

  const customerTransactions = useMemo(() => {
    let filtered = customerId === 'ALL'
      ? transactions
      : transactions.filter(tx => tx.customer_id === customerId);

    if (paymentModeFilter !== 'ALL') {
      filtered = filtered.filter(tx => tx.payment_mode === paymentModeFilter);
    }

    if (materialTypeFilter !== 'ALL') {
      filtered = filtered.filter(tx => tx.material_type === materialTypeFilter);
    }

    if (extraFeeFilter !== 'ALL') {
      filtered = filtered.filter(tx => (tx[extraFeeFilter] ?? 0) > 0);
    }

    return [...filtered].sort((a, b) => {
      if (a.transaction_date === b.transaction_date) {
        const timeCompare = (b.transaction_time ?? '').localeCompare(a.transaction_time ?? '');
        if (timeCompare !== 0) return timeCompare;
        return b.created_at.localeCompare(a.created_at);
      }
      return b.transaction_date.localeCompare(a.transaction_date);
    });
  }, [transactions, customerId, paymentModeFilter, materialTypeFilter, extraFeeFilter]);

  const customerSummaryList = useMemo(() => {
    const bucketMap: Record<string, CustomerSalesSummary> = {};

    customerTransactions.forEach(tx => {
      const bucketStart = getBucketStart(tx.transaction_date, customerGrouping);
      if (!bucketMap[bucketStart]) {
        bucketMap[bucketStart] = {
          bucketStart,
          count: 0,
          volume: 0,
          total: 0,
          customerIds: new Set<string>(),
        };
      }

      bucketMap[bucketStart].count += 1;
      bucketMap[bucketStart].volume += tx.volume_m3 ?? 0;
      bucketMap[bucketStart].total += tx.total_amount ?? 0;
      if (customerId === 'ALL' && tx.customer_id) bucketMap[bucketStart].customerIds.add(tx.customer_id);
    });

    return Object.values(bucketMap).sort((a, b) => b.bucketStart.localeCompare(a.bucketStart));
  }, [customerTransactions, customerGrouping, customerId]);

  const customerTotalSales = useMemo(() => customerTransactions.reduce((sum, tx) => sum + (tx.total_amount ?? 0), 0), [customerTransactions]);

  const customerTotalVolume = useMemo(() => customerTransactions.reduce((sum, tx) => sum + (tx.volume_m3 ?? 0), 0), [customerTransactions]);

  const customerCount = useMemo(() => new Set(customerTransactions.map(tx => tx.customer_id).filter(Boolean)).size, [customerTransactions]);

  const productSalesList = useMemo(() => {
    const map: Record<string, ProductSalesSummary> = {};

    transactions.forEach(tx => {
      const materialType = tx.material_type || 'Unspecified';
      if (!map[materialType]) {
        map[materialType] = { materialType, quantity: 0, volume: 0, revenue: 0 };
      }
      map[materialType].quantity += 1;
      map[materialType].volume += tx.volume_m3 ?? 0;
      map[materialType].revenue += reportNetSalesAmount(tx);
    });

    return Object.values(map).sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue || a.materialType.localeCompare(b.materialType));
  }, [transactions]);

  const productTotals = useMemo(() => ({
    quantity: productSalesList.reduce((sum, product) => sum + product.quantity, 0),
    volume: productSalesList.reduce((sum, product) => sum + product.volume, 0),
    revenue: productSalesList.reduce((sum, product) => sum + product.revenue, 0),
  }), [productSalesList]);

  const totalExpenses = useMemo(() => expenses.reduce((sum, expense) => sum + (expense.amount ?? 0), 0), [expenses]);

  const productChartData = useMemo(() => {
    const top = productSalesList.slice(0, 5);
    const others = productSalesList.slice(5);
    const rows = top.map(product => ({ label: product.materialType, value: product.quantity }));
    const otherQuantity = others.reduce((sum, product) => sum + product.quantity, 0);
    if (otherQuantity > 0) rows.push({ label: 'Others', value: otherQuantity });
    return rows;
  }, [productSalesList]);

  const revenueLineItems = useMemo(() => {
    const rows = productSalesList.map(product => ({
      label: product.materialType,
      amount: product.revenue,
      share: grandNetSales > 0 ? (product.revenue / grandNetSales) * 100 : 0,
    }));
    return compactFinancialLineItems(rows, 'Other Sales');
  }, [grandNetSales, productSalesList]);

  const expenseLineItems = useMemo(() => {
    const rows = expenseCategoryTotals.map(([label, amount]) => ({
      label,
      amount,
      share: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
    }));
    return compactFinancialLineItems(rows, 'Other Expenses');
  }, [expenseCategoryTotals, totalExpenses]);

  const netIncomeList = useMemo(() => {
    const bucketKeys = createContinuousBuckets(range.start, range.end, netGrouping);
    const bucketMap: Record<string, NetIncomeSummary> = {};

    bucketKeys.forEach(bucketStart => {
      bucketMap[bucketStart] = { bucketStart, revenue: 0, expenses: 0 };
    });

    transactions.forEach(tx => {
      const bucketStart = getBucketStart(tx.transaction_date, netGrouping);
      if (!bucketMap[bucketStart]) bucketMap[bucketStart] = { bucketStart, revenue: 0, expenses: 0 };
      bucketMap[bucketStart].revenue += reportNetSalesAmount(tx);
    });

    expenses.forEach(expense => {
      const bucketStart = getBucketStart(expense.expense_date, netGrouping);
      if (!bucketMap[bucketStart]) bucketMap[bucketStart] = { bucketStart, revenue: 0, expenses: 0 };
      bucketMap[bucketStart].expenses += expense.amount ?? 0;
    });

    return Object.values(bucketMap).sort((a, b) => b.bucketStart.localeCompare(a.bucketStart));
  }, [transactions, expenses, range.start, range.end, netGrouping]);

  const netIncome = grandNetSales - totalExpenses;

  const selectedCustomer = customerId === 'ALL' ? null : customers.find(customer => customer.id === customerId) ?? null;

  const salesCurrentPage = Math.min(salesPage, Math.max(1, Math.ceil(salesSummaryList.length / REPORT_PAGE_SIZE)));

  const pagedSalesSummary = useMemo(() => paginate(salesSummaryList, salesCurrentPage, REPORT_PAGE_SIZE), [salesSummaryList, salesCurrentPage]);

  const customerSummaryCurrentPage = Math.min(customerSummaryPage, Math.max(1, Math.ceil(customerSummaryList.length / REPORT_PAGE_SIZE)));

  const pagedCustomerSummary = useMemo(() => paginate(customerSummaryList, customerSummaryCurrentPage, REPORT_PAGE_SIZE), [customerSummaryList, customerSummaryCurrentPage]);

  const customerTransactionsCurrentPage = Math.min(customerTransactionsPage, Math.max(1, Math.ceil(customerTransactions.length / REPORT_PAGE_SIZE)));

  const pagedCustomerTransactions = useMemo(() => paginate(customerTransactions, customerTransactionsCurrentPage, REPORT_PAGE_SIZE), [customerTransactions, customerTransactionsCurrentPage]);

  const expenseSummaryCurrentPage = Math.min(expenseSummaryPage, Math.max(1, Math.ceil(expenseSummaryList.length / REPORT_PAGE_SIZE)));

  const pagedExpenseSummary = useMemo(() => paginate(expenseSummaryList, expenseSummaryCurrentPage, REPORT_PAGE_SIZE), [expenseSummaryList, expenseSummaryCurrentPage]);

  const expenseCategoryCurrentPage = Math.min(expenseCategoryPage, Math.max(1, Math.ceil(expenseCategoryTotals.length / REPORT_PAGE_SIZE)));

  const pagedExpenseCategories = useMemo(() => paginate(expenseCategoryTotals, expenseCategoryCurrentPage, REPORT_PAGE_SIZE), [expenseCategoryTotals, expenseCategoryCurrentPage]);

  const productsCurrentPage = Math.min(productsPage, Math.max(1, Math.ceil(productSalesList.length / REPORT_PAGE_SIZE)));

  const pagedProductSales = useMemo(() => paginate(productSalesList, productsCurrentPage, REPORT_PAGE_SIZE), [productSalesList, productsCurrentPage]);
  return {
    activeTab,
    setActiveTab,
    periodMode,
    setPeriodMode,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    selectedMonth,
    setSelectedMonth,
    selectedYear,
    setSelectedYear,
    customerId,
    setCustomerId,
    paymentModeFilter,
    setPaymentModeFilter,
    materialTypeFilter,
    setMaterialTypeFilter,
    extraFeeFilter,
    setExtraFeeFilter,
    customerGrouping,
    setCustomerGrouping,
    expenseGrouping,
    setExpenseGrouping,
    netGrouping,
    setNetGrouping,
    setSalesPage,
    setCustomerSummaryPage,
    setCustomerTransactionsPage,
    setExpenseSummaryPage,
    setExpenseCategoryPage,
    setProductsPage,
    transactions,
    expenses,
    expenseLedgerFilter,
    setExpenseLedgerFilter,
    customers,
    loading,
    customerLoading,
    error,
    selectedTransaction,
    setSelectedTransaction,
    isModalOpen,
    setIsModalOpen,
    infoModal,
    setInfoModal,
    range,
    yearOptions,
    fetchReportData,
    salesSummaryList,
    grandNetSales,
    grandDrFees,
    grandDeliveryFees,
    grandExtraFees,
    grandVolume,
    cashTotal,
    poTotal,
    offsetTotal,
    gcashTotal,
    bankTransferTotal,
    customerCreditTotal,
    hourlyKpiList,
    peakHour,
    averageTransactionsPerActiveHour,
    expenseSummaryList,
    totalExpenseRecords,
    expenseCategoryTotals,
    topExpenseCategory,
    topExpenseCategoryAmount,
    materialTypeOptions,
    customerTransactions,
    customerSummaryList,
    customerTotalSales,
    customerTotalVolume,
    customerCount,
    productSalesList,
    productTotals,
    totalExpenses,
    productChartData,
    revenueLineItems,
    expenseLineItems,
    netIncomeList,
    netIncome,
    selectedCustomer,
    salesCurrentPage,
    pagedSalesSummary,
    customerSummaryCurrentPage,
    pagedCustomerSummary,
    customerTransactionsCurrentPage,
    pagedCustomerTransactions,
    expenseSummaryCurrentPage,
    pagedExpenseSummary,
    expenseCategoryCurrentPage,
    pagedExpenseCategories,
    productsCurrentPage,
    pagedProductSales
  };
}

export type ReportsData = ReturnType<typeof useReportsData>;
