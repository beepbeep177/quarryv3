import { LogOut } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import AppSections from './components/AppSections';
import ErrorBoundary from './components/ErrorBoundary';
import ModuleLoading from './components/ModuleLoading';
import type { ReportTab } from './components/reports/types';
import Sidebar from './components/Sidebar';
import { useAuth } from './contexts/AuthContext';
import type { TransactionWithRelations } from './lib/database.types';
import { sectionFromHash, sectionHref } from './lib/navigation';
import AuthPage from './pages/AuthPage';
import type { NavSection } from './types';

const AddEntryModal = lazy(() => import('./components/AddEntryModal'));

export default function App() {
  const { user, role, isManager, loading, authError, signOut, can } = useAuth();
  const [activeSection, updateActiveSection] = useState<NavSection>(() => sectionFromHash(window.location.hash));
  const setActiveSection = useCallback((section: NavSection) => {
    window.location.hash = sectionHref(section);
    updateActiveSection(section);
  }, []);
  useEffect(() => {
    const onHashChange = () => updateActiveSection(sectionFromHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionWithRelations | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [reportTab, setReportTab] = useState<ReportTab>('sales');
  const canAddDailyLedger = can('DAILY_LEDGER_ADD');
  const canUploadDailyLedger = can('DAILY_LEDGER_UPLOAD');
  const canViewSection = useMemo<Record<NavSection, boolean>>(() => ({
    dashboard: can('DASHBOARD_VIEW'),
    reconciliation: can('RECONCILIATION_VIEW') || isManager,
    'daily-add': canAddDailyLedger,
    'daily-view': can('DAILY_LEDGER_VIEW'),
    'customers-list': can('CUSTOMERS_VIEW') || can('CUSTOMERS_ADD') || can('CUSTOMERS_EDIT') || can('CUSTOMERS_DELETE'),
    'customers-ar': can('ACCOUNTS_RECEIVABLE_VIEW') || can('ACCOUNTS_RECEIVABLE_EDIT'),
    'logistics-trucks': can('TRUCKS_VIEW') || can('TRUCKS_ADD') || can('TRUCKS_EDIT') || can('TRUCKS_DELETE'),
    'logistics-pricing': can('PRICING_VIEW') || can('PRICING_ADD') || can('PRICING_EDIT') || can('PRICING_DELETE'),
    expenses: can('EXPENSES_VIEW') || can('EXPENSES_ADD') || can('EXPENSES_EDIT') || can('EXPENSES_DELETE'),
    'fuel-management': can('FUEL_VIEW') || can('FUEL_PURCHASE_ADD') || can('FUEL_ISSUANCE_ADD') || can('FUEL_PURCHASE_EDIT') || can('FUEL_ISSUANCE_EDIT') || can('FUEL_ADJUST') || can('FUEL_EXPORT') || can('FUEL_EQUIPMENT_MANAGE') || isManager,
    'hauler-offset-ledger': can('HAULER_OFFSET_LEDGER_VIEW') || can('HAULER_OFFSET_LEDGER_ADD') || can('HAULER_OFFSET_LEDGER_ADJUST') || can('CUSTOMER_CREDIT_VIEW') || can('CUSTOMER_CREDIT_ADD') || can('CUSTOMER_CREDIT_ADJUST') || isManager,
    operations: can('OPERATIONS_DASHBOARD_VIEW') || can('SC_OPERATIONS_VIEW') || can('SC_OPERATIONS_ADD') || can('SC_OPERATIONS_EDIT') || can('SW_OPERATIONS_VIEW') || can('SW_OPERATIONS_ADD') || can('SW_OPERATIONS_EDIT') || can('QS_OPERATIONS_VIEW') || can('QS_OPERATIONS_ADD') || can('QS_OPERATIONS_EDIT') || can('WB_OPERATIONS_VIEW') || can('WB_OPERATIONS_ADD') || can('WB_OPERATIONS_EDIT') || isManager,
    'operations-dashboard': can('OPERATIONS_DASHBOARD_VIEW') || isManager,
    'operations-stone-crusher': can('SC_OPERATIONS_VIEW') || can('SC_OPERATIONS_ADD') || can('SC_OPERATIONS_EDIT') || isManager,
    'operations-sand-washing': can('SW_OPERATIONS_VIEW') || can('SW_OPERATIONS_ADD') || can('SW_OPERATIONS_EDIT') || isManager,
    'operations-quarry-site': can('QS_OPERATIONS_VIEW') || can('QS_OPERATIONS_ADD') || can('QS_OPERATIONS_EDIT') || isManager,
    'operations-wobbler': can('WB_OPERATIONS_VIEW') || can('WB_OPERATIONS_ADD') || can('WB_OPERATIONS_EDIT') || isManager,
    'workforce-employees': can('WF_EMPLOYEES_VIEW') || can('WF_EMPLOYEES_MANAGE') || isManager,
    'workforce-attendance': can('WF_ATTENDANCE_VIEW') || can('WF_ATTENDANCE_IMPORT') || can('WF_ATTENDANCE_ADJUST') || isManager,
    'workforce-payroll': can('WF_PAYROLL_VIEW') || can('WF_PAYROLL_MANAGE') || can('WF_PAYROLL_LOCK') || isManager,
    'workforce-cash-advances': can('WF_CASH_ADVANCE_VIEW') || can('WF_CASH_ADVANCE_MANAGE') || isManager,
    'workforce-settings': can('WF_SETTINGS_MANAGE') || isManager,
    reports: can('REPORTS_VIEW'),
    'access-control': can('USER_GROUP_ACCESS_VIEW') || can('USER_GROUP_ACCESS_MANAGE') || can('USER_ACCOUNTS_MANAGE') || can('AUDIT_LOG_VIEW'),
  }), [can, canAddDailyLedger, isManager]);

  useEffect(() => {
    if (loading || authError) return;
    if (activeSection === 'daily-add' && canAddDailyLedger) {
      setShowAddModal(true);
      setActiveSection('daily-view');
      return;
    }
    if (canViewSection[activeSection]) return;

    const fallback = ([
      'dashboard',
      'reconciliation',
      'daily-view',
      'customers-list',
      'customers-ar',
      'logistics-trucks',
      'logistics-pricing',
      'expenses',
      'fuel-management',
      'hauler-offset-ledger',
      'operations-dashboard',
      'operations-stone-crusher',
      'operations-sand-washing',
      'operations-quarry-site',
      'operations-wobbler',
      'operations',
      'workforce-employees',
      'workforce-attendance',
      'workforce-payroll',
      'workforce-cash-advances',
      'workforce-settings',
      'reports',
      'access-control',
    ] as NavSection[]).find(section => canViewSection[section]);

    if (fallback) setActiveSection(fallback);
  }, [activeSection, authError, canAddDailyLedger, canViewSection, loading, setActiveSection]);

  function handleEditTransaction(tx: TransactionWithRelations) {
    setEditingTransaction(tx);
    setShowAddModal(true);
  }

  function handleModalClose() {
    setShowAddModal(false);
    setEditingTransaction(null);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin mx-auto mb-3"></div>
          <p className="text-slate-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center px-6">
        <div role="alert" className="max-w-md text-center">
          <p className="text-white font-semibold mb-2">Unable to load Quarry</p>
          <p className="text-slate-400 text-sm mb-5">{authError}</p>
          <button onClick={() => window.location.reload()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500">Try again</button>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  function handleNavigate(section: NavSection) {
    if (!canViewSection[section]) {
      return;
    }

    if (section === 'daily-add') {
      if (canAddDailyLedger) setShowAddModal(true);
      setActiveSection('daily-view');
      return;
    }

    if (section === 'reports') {
      setReportTab('sales');
    }

    if (section === 'operations') {
      const firstAllowedOperation = ([
        'operations-dashboard',
        'operations-stone-crusher',
        'operations-sand-washing',
        'operations-quarry-site',
        'operations-wobbler',
      ] as NavSection[]).find(operationSection => canViewSection[operationSection]);
      setActiveSection(firstAllowedOperation ?? section);
      return;
    }

    setActiveSection(section);
  }

  function openProductReport() {
    if (!can('REPORTS_VIEW')) return;
    setReportTab('products');
    setActiveSection('reports');
  }

  function handleAddSuccess() {
    setRefreshKey(k => k + 1);
    if (!editingTransaction) {
      setActiveSection('daily-view');
    }
  }

  async function handleSignOut() {
    await signOut();
  }

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">
      <Sidebar
        activeSection={activeSection}
        onNavigate={handleNavigate}
        can={can}
      />

      <main className="flex-1 overflow-auto flex flex-col">
        <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-700">{user.email}</p>
            <p className="text-xs text-slate-500">Signed in as {role ?? 'operator'}</p>
          </div>
          <div className="flex items-center gap-3">
            {!isManager && (
              <span className="inline-flex px-3 py-1 rounded-full bg-sky-50 text-sky-700 text-xs font-semibold border border-sky-200">
                Encoder access
              </span>
            )}
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="max-w-7xl mx-auto px-6 py-7">
            <ErrorBoundary key={activeSection}>
              <Suspense fallback={<ModuleLoading />}>
                <AppSections
                  activeSection={activeSection}
                  canViewSection={canViewSection}
                  reportTab={reportTab}
                  refreshKey={refreshKey}
                  onNavigate={handleNavigate}
                  onOpenProductReport={openProductReport}
                  onAddEntry={() => canAddDailyLedger && setShowAddModal(true)}
                  onEditTransaction={handleEditTransaction}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>
      </main>

      {showAddModal && (
        <ErrorBoundary area="the entry form">
          <Suspense fallback={<ModuleLoading overlay />}><AddEntryModal
            onClose={handleModalClose}
            onSuccess={handleAddSuccess}
            transaction={editingTransaction ?? undefined}
            canUploadAttachments={canUploadDailyLedger}
          /></Suspense>
        </ErrorBoundary>
      )}
    </div>
  );
}
