import { useState } from 'react';
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
import Reports from './components/Reports';
import AccessControl from './components/AccessControl';
import AuthPage from './pages/AuthPage';
import { useAuth } from './contexts/AuthContext';
import type { NavSection } from './types';
import type { TransactionWithRelations } from './lib/database.types';
import type { ReportTab } from './components/Reports';

export default function App() {
  const { user, role, isManager, loading, signOut } = useAuth();
  const [activeSection, setActiveSection] = useState<NavSection>(isManager ? 'dashboard' : 'daily-view');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionWithRelations | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [reportTab, setReportTab] = useState<ReportTab>('sales');
  const canManageRecords = !!role;

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
    // Operators cannot access manager-only sections
    if (!isManager && (section === 'dashboard' || section === 'reports' || section === 'access-control')) {
      return;
    }

    if (section === 'daily-add') {
      // Only managers can add daily transactions
      if (isManager) setShowAddModal(true);
      setActiveSection('daily-view');
      return;
    }

    if (section === 'reports') {
      setReportTab('sales');
    }

    setActiveSection(section);
  }

  function openProductReport() {
    setReportTab('products');
    setActiveSection('reports');
  }

  function handleAddSuccess() {
    setRefreshKey(k => k + 1);
    setActiveSection('daily-view');
  }

  async function handleSignOut() {
    await signOut();
  }

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">
      <Sidebar
        activeSection={activeSection}
        onNavigate={handleNavigate}
        isManager={isManager}
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
                canManageRecords={canManageRecords}
              />
            )}
            {activeSection === 'daily-view' && (
              <DailyLedger
                onAddEntry={() => isManager && setShowAddModal(true)}
                onEditEntry={handleEditTransaction}
                refreshKey={refreshKey}
                readOnly={!isManager}
              />
            )}
            {activeSection === 'customers-list' && <CustomersList readOnly={!canManageRecords} />}
            {activeSection === 'customers-ar' && <AccountsReceivable readOnly={!isManager} />}
            {activeSection === 'logistics-trucks' && <TruckList readOnly={!canManageRecords} />}
            {activeSection === 'logistics-pricing' && <PricingList readOnly={!isManager} />}
            {activeSection === 'expenses' && <Expenses readOnly={!isManager} />}
            {activeSection === 'reports' && <Reports initialTab={reportTab} />}
            {activeSection === 'access-control' && isManager && <AccessControl />}
          </div>
        </div>
      </main>

      {showAddModal && (
        <AddEntryModal
          onClose={handleModalClose}
          onSuccess={handleAddSuccess}
          transaction={editingTransaction ?? undefined}
        />
      )}
    </div>
  );
}
