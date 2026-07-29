import {
  LayoutDashboard,
  ClipboardList,
  Users,
  Truck,
  FileBarChart2,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  PlusCircle,
  Eye,
  BookUser,
  ReceiptText,
  ListTodo,
  DollarSign,
  Banknote,
  ShieldCheck,
  Droplet,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ActivityCode } from '../lib/database.types';
import type { NavSection } from '../types';

interface SidebarProps {
  activeSection: NavSection;
  onNavigate: (section: NavSection) => void;
  can: (activityCode: ActivityCode) => boolean;
}

interface MenuItem {
  id: NavSection;
  label: string;
  icon: React.ReactNode;
  children?: { id: NavSection; label: string; icon: React.ReactNode }[];
}

export default function Sidebar({ activeSection, onNavigate, can }: SidebarProps) {
  const menuItems = useMemo<MenuItem[]>(() => {
    const items: MenuItem[] = [];

    if (can('DASHBOARD_VIEW')) {
      items.push({
        id: 'dashboard',
        label: 'Dashboard',
        icon: <LayoutDashboard size={18} />,
      });
    }

    if (can('DAILY_LEDGER_VIEW')) {
      items.push(
      {
        id: 'daily-view',
        label: 'Daily Transactions',
        icon: <ClipboardList size={18} />,
        children: [
          ...(can('DAILY_LEDGER_ADD') ? [{ id: 'daily-add' as const, label: 'Add Entry', icon: <PlusCircle size={15} /> }] : []),
          { id: 'daily-view' as const, label: 'View Today', icon: <Eye size={15} /> },
        ],
      },
      );
    }

    const customerChildren = [
      ...(can('CUSTOMERS_VIEW') ? [{ id: 'customers-list' as const, label: 'Masterlist', icon: <BookUser size={15} /> }] : []),
      ...(can('ACCOUNTS_RECEIVABLE_VIEW') ? [{ id: 'customers-ar' as const, label: 'Accounts Receivable', icon: <ReceiptText size={15} /> }] : []),
    ];
    if (customerChildren.length > 0) {
      items.push(
      {
        id: 'customers-list',
        label: 'Customers',
        icon: <Users size={18} />,
        children: customerChildren,
      },
      );
    }

    const logisticsChildren = [
      ...(can('TRUCKS_VIEW') ? [{ id: 'logistics-trucks' as const, label: 'Truck List', icon: <ListTodo size={15} /> }] : []),
      ...(can('PRICING_VIEW') ? [{ id: 'logistics-pricing' as const, label: 'Pricing', icon: <DollarSign size={15} /> }] : []),
    ];
    if (logisticsChildren.length > 0) {
      items.push(
      {
        id: 'logistics-trucks',
        label: 'Logistics',
        icon: <Truck size={18} />,
        children: logisticsChildren,
      },
      );
    }

    if (can('EXPENSES_VIEW')) {
      items.push(
        {
          id: 'expenses',
          label: 'Expenses',
          icon: <Banknote size={18} />,
        },
      );
    }

    if (can('FUEL_VIEW') || can('USER_GROUP_ACCESS_MANAGE')) {
      items.push(
        {
          id: 'fuel-management',
          label: 'Fuel Management',
          icon: <Droplet size={18} />,
        },
      );
    }

    if (can('HAULER_OFFSET_LEDGER_VIEW') || can('USER_GROUP_ACCESS_MANAGE')) {
      items.push(
        {
          id: 'hauler-offset-ledger',
          label: 'Hauler Offset Ledger',
          icon: <ReceiptText size={18} />,
        },
      );
    }

    if (can('REPORTS_VIEW')) {
      items.push(
        {
          id: 'reports',
          label: 'Reports',
          icon: <FileBarChart2 size={18} />,
        },
      );
    }

    if (can('USER_GROUP_ACCESS_VIEW') || can('USER_GROUP_ACCESS_MANAGE') || can('USER_ACCOUNTS_MANAGE') || can('AUDIT_LOG_VIEW')) {
      items.push(
        {
          id: 'access-control',
          label: 'Access Control',
          icon: <ShieldCheck size={18} />,
        },
      );
    }

    return items;
  }, [can]);

  const getDefaultOpen = () => {
    const map: Record<string, boolean> = {
      'daily-add': true,
      'daily-view': true,
      'customers-list': true,
      'customers-ar': true,
      'logistics-trucks': true,
      'logistics-pricing': true,
      'fuel-management': true,
    };
    return map[activeSection] ? activeSection.startsWith('daily') ? 'daily-view' :
      activeSection.startsWith('customers') ? 'customers-list' : 'logistics-trucks' : null;
  };

  const [openGroup, setOpenGroup] = useState<string | null>(getDefaultOpen);
  const [collapsed, setCollapsed] = useState(false);

  const isGroupActive = (item: MenuItem) => {
    if (!item.children) return activeSection === item.id;
    return item.children.some(c => c.id === activeSection);
  };

  const toggleGroup = (id: string) => {
    setOpenGroup(prev => (prev === id ? null : id));
  };

  const handleGroupClick = (item: MenuItem) => {
    if (!collapsed) {
      toggleGroup(item.id);
      return;
    }

    const activeChild = item.children?.find(child => child.id === activeSection);
    onNavigate(activeChild?.id ?? item.children?.[0]?.id ?? item.id);
  };

  return (
    <aside className={`${collapsed ? 'w-20' : 'w-64'} min-h-screen bg-slate-950 flex flex-col transition-all duration-200 ease-out shrink-0`}>
      <div className={`${collapsed ? 'px-3 justify-center' : 'px-4'} py-5 border-b border-slate-800 flex items-center gap-3 w-full`}>
        <div className="w-12 h-12 rounded-full flex items-center justify-center p-0.5 shadow-sm shrink-0 bg-white/5">
          <img 
            src="/jafcor_logo.png" 
            alt="Jafcor Logo" 
            className="w-full h-full object-contain" 
          />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-white font-bold text-base tracking-wide truncate">JAFCOR</p>
            <p className="text-slate-400 text-xs truncate">Management System</p>
          </div>
        )}
      </div>

      <div className="px-3 pt-3">
        <button
          onClick={() => setCollapsed(value => !value)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`w-full flex items-center ${collapsed ? 'justify-center px-0' : 'justify-end px-3'} py-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800/60 transition-colors`}
        >
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {menuItems.map(item => {
          const hasChildren = !!item.children;
          const isOpen = !collapsed && openGroup === item.id;
          const groupActive = isGroupActive(item);

          if (!hasChildren) {
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'} py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === item.id
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <span className={activeSection === item.id ? 'text-emerald-400' : ''}>{item.icon}</span>
                {!collapsed && item.label}
              </button>
            );
          }

          return (
            <div key={item.id}>
              <button
                onClick={() => handleGroupClick(item)}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'} py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  groupActive
                    ? collapsed
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'text-emerald-400'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <span className={groupActive ? 'text-emerald-400' : ''}>{item.icon}</span>
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">{item.label}</span>
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </>
                )}
              </button>

              {isOpen && (
                <div className="ml-4 mt-0.5 space-y-0.5 pl-3 border-l border-slate-800">
                  {item.children!.map(child => (
                    <button
                      key={child.id}
                      onClick={() => onNavigate(child.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                        activeSection === child.id
                          ? 'bg-emerald-500/15 text-emerald-400 font-medium'
                          : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                      }`}
                    >
                      {child.icon}
                      {child.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer Update */}
      <div className={`${collapsed ? 'px-3 text-center' : 'px-5'} py-4 border-t border-slate-800`}>
        {collapsed ? (
          <p className="text-slate-600 text-xs" title="v1.0.0">&copy;</p>
        ) : (
          <p className="text-slate-600 text-xs">v1.0.0 &copy; 2026 Jafcor Dev Co.</p>
        )}
      </div>
    </aside>
  );
}
