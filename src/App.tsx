import { useEffect, useMemo, useState } from 'react';
import { LogOut } from 'lucide-react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import DailyLedger from './components/DailyLedger';
import AddEntryModal from './components/AddEntryModal';
import CustomersList from './components/CustomersList';
import AccountsReceivable from './components/AccountsReceivable';
import TruckList from './components/TruckList';
import PricingList from './components/PricingList';
import Expenses from './components/Expenses';
import FuelManagement from './components/FuelManagement';
import HaulerOffsetLedger from './components/HaulerOffsetLedger';
import StoneCrusherOperations from './components/StoneCrusherOperations';
import SandWashingOperations from './components/SandWashingOperations';
import QuarrySiteOperations from './components/QuarrySiteOperations';
import Reports from './components/Reports';
import AccessControl from './components/AccessControl';
import AuthPage from './pages/AuthPage';
import { useAuth } from './contexts/AuthContext';
import type { NavSection } from './types';
import type { TransactionWithRelations } from './lib/database.types';
import type { ReportTab } from './components/Reports';

export default function App() {
  const { user, role, isManager, loading, signOut, can } = useAuth();
  const [activeSection, setActiveSection] = useState<NavSection>(isManager ? 'dashboard' : 'daily-view');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionWithRelations | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [reportTab, setReportTab] = useState<ReportTab>('sales');
  const canAddDailyLedger = can('DAILY_LEDGER_ADD');
  const canEditDailyLedger = can('DAILY_LEDGER_EDIT');
  const canDeleteDailyLedger = can('DAILY_LEDGER_DELETE');
  const canUploadDailyLedger = can('DAILY_LEDGER_UPLOAD');
  const canViewSection = useMemo<Record<NavSection, boolean>>(() => ({
    dashboard: can('DASHBOARD_VIEW'),
    'daily-add': canAddDailyLedger,
    'daily-view': can('DAILY_LEDGER_VIEW'),
    'customers-list': can('CUSTOMERS_VIEW') || can('CUSTOMERS_ADD') || can('CUSTOMERS_EDIT') || can('CUSTOMERS_DELETE'),
    'customers-ar': can('ACCOUNTS_RECEIVABLE_VIEW') || can('ACCOUNTS_RECEIVABLE_EDIT'),
    'logistics-trucks': can('TRUCKS_VIEW') || can('TRUCKS_ADD') || can('TRUCKS_EDIT') || can('TRUCKS_DELETE'),
    'logistics-pricing': can('PRICING_VIEW') || can('PRICING_ADD') || can('PRICING_EDIT') || can('PRICING_DELETE'),
    expenses: can('EXPENSES_VIEW') || can('EXPENSES_ADD') || can('EXPENSES_EDIT') || can('EXPENSES_DELETE'),
    'fuel-management': can('FUEL_VIEW') || can('FUEL_PURCHASE_ADD') || can('FUEL_ISSUANCE_ADD') || can('FUEL_ADJUST') || can('FUEL_EXPORT') || can('FUEL_EQUIPMENT_MANAGE') || isManager,
    'hauler-offset-ledger': can('HAULER_OFFSET_LEDGER_VIEW') || can('HAULER_OFFSET_LEDGER_ADD') || can('HAULER_OFFSET_LEDGER_ADJUST') || can('CUSTOMER_CREDIT_VIEW') || can('CUSTOMER_CREDIT_ADD') || can('CUSTOMER_CREDIT_ADJUST') || isManager,
    operations: can('SC_OPERATIONS_VIEW') || can('SC_OPERATIONS_ADD') || can('SC_OPERATIONS_EDIT') || can('SW_OPERATIONS_VIEW') || can('SW_OPERATIONS_ADD') || can('SW_OPERATIONS_EDIT') || can('QS_OPERATIONS_VIEW') || can('QS_OPERATIONS_ADD') || can('QS_OPERATIONS_EDIT') || isManager,
    'operations-stone-crusher': can('SC_OPERATIONS_VIEW') || can('SC_OPERATIONS_ADD') || can('SC_OPERATIONS_EDIT') || isManager,
    'operations-sand-washing': can('SW_OPERATIONS_VIEW') || can('SW_OPERATIONS_ADD') || can('SW_OPERATIONS_EDIT') || isManager,
    'operations-quarry-site': can('QS_OPERATIONS_VIEW') || can('QS_OPERATIONS_ADD') || can('QS_OPERATIONS_EDIT') || isManager,
    reports: can('REPORTS_VIEW'),
    'access-control': can('USER_GROUP_ACCESS_VIEW') || can('USER_GROUP_ACCESS_MANAGE') || can('USER_ACCOUNTS_MANAGE') || can('AUDIT_LOG_VIEW'),
  }), [can, canAddDailyLedger, isManager]);

  useEffect(() => {
    if (loading || canViewSection[activeSection]) return;

    const fallback = ([
      'dashboard',
      'daily-view',
      'customers-list',
      'customers-ar',
      'logistics-trucks',
      'logistics-pricing',
      'expenses',
      'fuel-management',
      'hauler-offset-ledger',
      'operations-stone-crusher',
      'operations-sand-washing',
      'operations-quarry-site',
      'operations',
      'reports',
      'access-control',
    ] as NavSection[]).find(section => canViewSection[section]);

    if (fallback) setActiveSection(fallback);
  }, [activeSection, canViewSection, loading]);

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
        'operations-stone-crusher',
        'operations-sand-washing',
        'operations-quarry-site',
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
            {activeSection === 'dashboard' && (
              <Dashboard
                onNavigate={handleNavigate}
                onOpenProductReport={openProductReport}
                refreshKey={refreshKey}
                canManageRecords={canAddDailyLedger}
              />
            )}
            {activeSection === 'daily-view' && (
              <DailyLedger
                onAddEntry={() => canAddDailyLedger && setShowAddModal(true)}
                onEditEntry={handleEditTransaction}
                refreshKey={refreshKey}
                canAdd={canAddDailyLedger}
                canEdit={canEditDailyLedger}
                canDelete={canDeleteDailyLedger}
              />
            )}
            {activeSection === 'customers-list' && <CustomersList canAdd={can('CUSTOMERS_ADD')} canEdit={can('CUSTOMERS_EDIT')} canDelete={can('CUSTOMERS_DELETE')} />}
            {activeSection === 'customers-ar' && <AccountsReceivable canEdit={can('ACCOUNTS_RECEIVABLE_EDIT')} />}
            {activeSection === 'logistics-trucks' && <TruckList canAdd={can('TRUCKS_ADD')} canEdit={can('TRUCKS_EDIT')} canDelete={can('TRUCKS_DELETE')} />}
            {activeSection === 'logistics-pricing' && <PricingList canAdd={can('PRICING_ADD')} canEdit={can('PRICING_EDIT')} canDelete={can('PRICING_DELETE')} />}
            {activeSection === 'expenses' && <Expenses canAdd={can('EXPENSES_ADD')} canEdit={can('EXPENSES_EDIT') || isManager} canDelete={can('EXPENSES_DELETE')} />}
            {activeSection === 'fuel-management' && <FuelManagement canAddPurchase={can('FUEL_PURCHASE_ADD') || isManager} canIssue={can('FUEL_ISSUANCE_ADD') || isManager} canAdjust={can('FUEL_ADJUST') || isManager} canExport={can('FUEL_EXPORT') || isManager} canManageEquipment={can('FUEL_EQUIPMENT_MANAGE') || isManager} />}
            {activeSection === 'hauler-offset-ledger' && <HaulerOffsetLedger canAdd={can('HAULER_OFFSET_LEDGER_ADD') || isManager} canAdjust={can('HAULER_OFFSET_LEDGER_ADJUST') || isManager} canExport={can('HAULER_OFFSET_LEDGER_EXPORT') || isManager} canViewDetail={can('HAULER_OFFSET_LEDGER_VIEW_DETAIL') || isManager} canViewStatement={can('HAULER_STATEMENT_VIEW') || isManager} canExportStatement={can('HAULER_STATEMENT_EXPORT') || isManager} canCustomerCreditAdd={can('CUSTOMER_CREDIT_ADD') || isManager} canCustomerCreditAdjust={can('CUSTOMER_CREDIT_ADJUST') || isManager} canCustomerCreditExport={can('CUSTOMER_CREDIT_EXPORT') || isManager} />}
            {activeSection === 'operations' && (
              canViewSection['operations-stone-crusher']
                ? <StoneCrusherOperations canAdd={can('SC_OPERATIONS_ADD') || isManager} canEdit={can('SC_OPERATIONS_EDIT') || isManager} canDelete={can('SC_OPERATIONS_DELETE') || isManager} canExport={can('SC_OPERATIONS_EXPORT') || isManager} />
                : canViewSection['operations-sand-washing']
                  ? <SandWashingOperations canAdd={can('SW_OPERATIONS_ADD') || isManager} canEdit={can('SW_OPERATIONS_EDIT') || isManager} canDelete={can('SW_OPERATIONS_DELETE') || isManager} canExport={can('SW_OPERATIONS_EXPORT') || isManager} />
                  : <QuarrySiteOperations canAdd={can('QS_OPERATIONS_ADD') || isManager} canEdit={can('QS_OPERATIONS_EDIT') || isManager} canDelete={can('QS_OPERATIONS_DELETE') || isManager} canExport={can('QS_OPERATIONS_EXPORT') || isManager} />
            )}
            {activeSection === 'operations-stone-crusher' && <StoneCrusherOperations canAdd={can('SC_OPERATIONS_ADD') || isManager} canEdit={can('SC_OPERATIONS_EDIT') || isManager} canDelete={can('SC_OPERATIONS_DELETE') || isManager} canExport={can('SC_OPERATIONS_EXPORT') || isManager} />}
            {activeSection === 'operations-sand-washing' && <SandWashingOperations canAdd={can('SW_OPERATIONS_ADD') || isManager} canEdit={can('SW_OPERATIONS_EDIT') || isManager} canDelete={can('SW_OPERATIONS_DELETE') || isManager} canExport={can('SW_OPERATIONS_EXPORT') || isManager} />}
            {activeSection === 'operations-quarry-site' && <QuarrySiteOperations canAdd={can('QS_OPERATIONS_ADD') || isManager} canEdit={can('QS_OPERATIONS_EDIT') || isManager} canDelete={can('QS_OPERATIONS_DELETE') || isManager} canExport={can('QS_OPERATIONS_EXPORT') || isManager} />}
            {activeSection === 'reports' && can('REPORTS_VIEW') && <Reports initialTab={reportTab} refreshKey={refreshKey} canEditTransactions={canEditDailyLedger} canExport={can('REPORTS_EXPORT') || isManager} canPrint={can('REPORTS_PRINT') || isManager} onEditTransaction={handleEditTransaction} />}
            {activeSection === 'access-control' && canViewSection['access-control'] && <AccessControl />}
          </div>
        </div>
      </main>

      {showAddModal && (
        <AddEntryModal
          onClose={handleModalClose}
          onSuccess={handleAddSuccess}
          transaction={editingTransaction ?? undefined}
          canUploadAttachments={canUploadDailyLedger}
        />
      )}
    </div>
  );
}
