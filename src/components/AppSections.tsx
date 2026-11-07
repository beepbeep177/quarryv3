import { lazy } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { TransactionWithRelations } from '../lib/database.types';
import type { NavSection } from '../types';
import type { ReportTab } from './reports/types';

const DailyReconciliation = lazy(() => import('./DailyReconciliation'));
const Dashboard = lazy(() => import('./Dashboard'));
const DailyLedger = lazy(() => import('./DailyLedger'));
const CustomersList = lazy(() => import('./CustomersList'));
const AccountsReceivable = lazy(() => import('./AccountsReceivable'));
const TruckList = lazy(() => import('./TruckList'));
const PricingList = lazy(() => import('./PricingList'));
const Expenses = lazy(() => import('./Expenses'));
const FuelManagement = lazy(() => import('./FuelManagement'));
const HaulerOffsetLedger = lazy(() => import('./HaulerOffsetLedger'));
const StoneCrusherOperations = lazy(() => import('./StoneCrusherOperations'));
const SandWashingOperations = lazy(() => import('./SandWashingOperations'));
const QuarrySiteOperations = lazy(() => import('./QuarrySiteOperations'));
const WobblerOperations = lazy(() => import('./WobblerOperations'));
const OperationsDashboard = lazy(() => import('./OperationsDashboard'));
const Reports = lazy(() => import('./Reports'));
const AccessControl = lazy(() => import('./AccessControl'));
const WorkforceEmployees = lazy(() => import('./workforce/WorkforceEmployees'));
const WorkforceAttendance = lazy(() => import('./workforce/WorkforceAttendance'));
const WorkforcePayroll = lazy(() => import('./workforce/WorkforcePayroll'));
const WorkforceCashAdvances = lazy(() => import('./workforce/WorkforceCashAdvances'));
const WorkforceSettings = lazy(() => import('./workforce/WorkforceSettings'));

interface AppSectionsProps {
  activeSection: NavSection;
  canViewSection: Record<NavSection, boolean>;
  reportTab: ReportTab;
  refreshKey: number;
  onNavigate: (section: NavSection) => void;
  onOpenProductReport: () => void;
  onAddEntry: () => void;
  onEditTransaction: (transaction: TransactionWithRelations) => void;
}

export default function AppSections({ activeSection, canViewSection, reportTab, refreshKey, onNavigate, onOpenProductReport, onAddEntry, onEditTransaction }: AppSectionsProps) {
  const { can, isManager } = useAuth();
  const canAddDailyLedger = can('DAILY_LEDGER_ADD');
  const canEditDailyLedger = can('DAILY_LEDGER_EDIT');
  const canDeleteDailyLedger = can('DAILY_LEDGER_DELETE');
  if (!canViewSection[activeSection]) return null;
  return (
    <>
      {activeSection === 'reconciliation' && <DailyReconciliation />}
      {activeSection === 'dashboard' && (
        <Dashboard
          onNavigate={onNavigate}
          onOpenProductReport={onOpenProductReport}
          refreshKey={refreshKey}
          canManageRecords={canAddDailyLedger}
        />
      )}
      {activeSection === 'daily-view' && (
        <DailyLedger
          onAddEntry={onAddEntry}
          onEditEntry={onEditTransaction}
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
      {activeSection === 'fuel-management' && <FuelManagement canAddPurchase={can('FUEL_PURCHASE_ADD') || isManager} canIssue={can('FUEL_ISSUANCE_ADD') || isManager} canEditPurchase={can('FUEL_PURCHASE_EDIT') || isManager} canEditIssuance={can('FUEL_ISSUANCE_EDIT') || isManager} canAdjust={can('FUEL_ADJUST') || isManager} canExport={can('FUEL_EXPORT') || isManager} canManageEquipment={can('FUEL_EQUIPMENT_MANAGE') || isManager} />}
      {activeSection === 'hauler-offset-ledger' && <HaulerOffsetLedger canAdd={can('HAULER_OFFSET_LEDGER_ADD') || isManager} canAdjust={can('HAULER_OFFSET_LEDGER_ADJUST') || isManager} canExport={can('HAULER_OFFSET_LEDGER_EXPORT') || isManager} canViewDetail={can('HAULER_OFFSET_LEDGER_VIEW_DETAIL') || isManager} canViewStatement={can('HAULER_STATEMENT_VIEW') || isManager} canExportStatement={can('HAULER_STATEMENT_EXPORT') || isManager} canCustomerCreditAdd={can('CUSTOMER_CREDIT_ADD') || isManager} canCustomerCreditAdjust={can('CUSTOMER_CREDIT_ADJUST') || isManager} canCustomerCreditExport={can('CUSTOMER_CREDIT_EXPORT') || isManager} />}
      {(activeSection === 'operations' || activeSection === 'operations-dashboard') && (
        <OperationsDashboard
          access={{
            stoneCrusher: true,
            sandWashing: true,
            quarrySite: true,
            wobbler: true,
          }}
          moduleNavigation={{
            stoneCrusher: canViewSection['operations-stone-crusher'],
            sandWashing: canViewSection['operations-sand-washing'],
            quarrySite: canViewSection['operations-quarry-site'],
            wobbler: canViewSection['operations-wobbler'],
          }}
          canMarkNoOperation={{
            stoneCrusher: can('SC_OPERATIONS_ADD') || isManager,
            sandWashing: can('SW_OPERATIONS_ADD') || isManager,
            quarrySite: can('QS_OPERATIONS_ADD') || isManager,
            wobbler: can('WB_OPERATIONS_ADD') || isManager,
          }}
          onNavigate={onNavigate}
        />
      )}
      {activeSection === 'operations-stone-crusher' && <StoneCrusherOperations canAdd={can('SC_OPERATIONS_ADD') || isManager} canEdit={can('SC_OPERATIONS_EDIT') || isManager} canDelete={can('SC_OPERATIONS_DELETE') || isManager} canExport={can('SC_OPERATIONS_EXPORT') || isManager} />}
      {activeSection === 'operations-sand-washing' && <SandWashingOperations canAdd={can('SW_OPERATIONS_ADD') || isManager} canEdit={can('SW_OPERATIONS_EDIT') || isManager} canDelete={can('SW_OPERATIONS_DELETE') || isManager} canExport={can('SW_OPERATIONS_EXPORT') || isManager} />}
      {activeSection === 'operations-quarry-site' && <QuarrySiteOperations canAdd={can('QS_OPERATIONS_ADD') || isManager} canEdit={can('QS_OPERATIONS_EDIT') || isManager} canDelete={can('QS_OPERATIONS_DELETE') || isManager} canExport={can('QS_OPERATIONS_EXPORT') || isManager} />}
      {activeSection === 'operations-wobbler' && <WobblerOperations canAdd={can('WB_OPERATIONS_ADD') || isManager} canEdit={can('WB_OPERATIONS_EDIT') || isManager} canDelete={can('WB_OPERATIONS_DELETE') || isManager} canExport={can('WB_OPERATIONS_EXPORT') || isManager} />}
      {activeSection === 'reports' && can('REPORTS_VIEW') && <Reports initialTab={reportTab} refreshKey={refreshKey} canEditTransactions={canEditDailyLedger} canExport={can('REPORTS_EXPORT') || isManager} canPrint={can('REPORTS_PRINT') || isManager} onEditTransaction={onEditTransaction} />}
      {activeSection === 'access-control' && canViewSection['access-control'] && <AccessControl />}
      {activeSection === 'workforce-employees' && <WorkforceEmployees canManage={can('WF_EMPLOYEES_MANAGE') || isManager} canViewRates={can('WF_EMPLOYEES_MANAGE') || can('WF_PAYROLL_VIEW') || can('WF_PAYROLL_MANAGE') || can('WF_PAYROLL_LOCK') || isManager} />}
      {activeSection === 'workforce-attendance' && <WorkforceAttendance canImport={can('WF_ATTENDANCE_IMPORT') || isManager} canAdjust={can('WF_ATTENDANCE_ADJUST') || isManager} canViewRates={can('WF_PAYROLL_VIEW') || can('WF_PAYROLL_MANAGE') || can('WF_PAYROLL_LOCK') || can('WF_EMPLOYEES_MANAGE') || isManager} />}
      {activeSection === 'workforce-payroll' && <WorkforcePayroll canManage={can('WF_PAYROLL_MANAGE') || isManager} canLock={can('WF_PAYROLL_LOCK') || isManager} canUnlock={isManager} />}
      {activeSection === 'workforce-cash-advances' && <WorkforceCashAdvances canManage={can('WF_CASH_ADVANCE_MANAGE') || isManager} />}
      {activeSection === 'workforce-settings' && <WorkforceSettings canManage={can('WF_SETTINGS_MANAGE') || isManager} />}
    </>
  );
}
