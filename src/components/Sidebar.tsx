import {
  LayoutDashboard,
  Briefcase,
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
  Factory,
  Mountain,
  Settings,
  Waves,
  Cog,
  Search,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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

type SidebarCategoryId = 'sales' | 'operations';

interface MenuCategory {
  id: SidebarCategoryId;
  label: string;
  icon: React.ReactNode;
  items: MenuItem[];
}

interface SearchEntry {
  id: NavSection;
  label: string;
  path: string;
  icon: React.ReactNode;
  haystack: string;
}

/** Extra words people may type for each page (English + common Filipino terms). */
const SEARCH_KEYWORDS: Partial<Record<NavSection, string>> = {
  dashboard: 'home overview sales today summary',
  'daily-add': 'add entry new transaction dr delivery receipt encode benta',
  'daily-view': 'daily ledger today transactions dr delivery receipt benta',
  'customers-list': 'customer masterlist client buyer',
  'customers-ar': 'accounts receivable ar utang balance po pending collection settlement',
  'logistics-trucks': 'truck list plate hauler driver',
  'logistics-pricing': 'pricing price materials rate presyo',
  expenses: 'expense gastos diesel payee supplier',
  'fuel-management': 'fuel diesel gas krudo purchase issuance inventory',
  'hauler-offset-ledger': 'accounts ledger hauler offset customer credit statement',
  reports: 'reports sales report export print',
  'access-control': 'access control users accounts permissions groups audit log',
  'operations-dashboard': 'operations dashboard production daily operations',
  'operations-stone-crusher': 'stone crusher crushing g1 dumps',
  'operations-sand-washing': 'sand washing vibro waste',
  'operations-quarry-site': 'quarry site binder boulder trips',
  'operations-wobbler': 'wobbler dumps loaders',
};

function getOpenGroupForSection(section: NavSection) {
  if (section.startsWith('daily')) return 'daily-view';
  if (section.startsWith('customers')) return 'customers-list';
  if (section.startsWith('logistics')) return 'logistics-trucks';
  if (section.startsWith('operations')) return 'operations';
  return null;
}

export default function Sidebar({ activeSection, onNavigate, can }: SidebarProps) {
  const salesItems = useMemo<MenuItem[]>(() => {
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
      ...(can('CUSTOMERS_VIEW') || can('CUSTOMERS_ADD') || can('CUSTOMERS_EDIT') || can('CUSTOMERS_DELETE') ? [{ id: 'customers-list' as const, label: 'Masterlist', icon: <BookUser size={15} /> }] : []),
      ...(can('ACCOUNTS_RECEIVABLE_VIEW') || can('ACCOUNTS_RECEIVABLE_EDIT') ? [{ id: 'customers-ar' as const, label: 'Accounts Receivable', icon: <ReceiptText size={15} /> }] : []),
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
      ...(can('TRUCKS_VIEW') || can('TRUCKS_ADD') || can('TRUCKS_EDIT') || can('TRUCKS_DELETE') ? [{ id: 'logistics-trucks' as const, label: 'Truck List', icon: <ListTodo size={15} /> }] : []),
      ...(can('PRICING_VIEW') || can('PRICING_ADD') || can('PRICING_EDIT') || can('PRICING_DELETE') ? [{ id: 'logistics-pricing' as const, label: 'Pricing', icon: <DollarSign size={15} /> }] : []),
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

    if (can('EXPENSES_VIEW') || can('EXPENSES_ADD') || can('EXPENSES_EDIT') || can('EXPENSES_DELETE')) {
      items.push(
        {
          id: 'expenses',
          label: 'Expenses',
          icon: <Banknote size={18} />,
        },
      );
    }

    if (can('FUEL_VIEW') || can('FUEL_PURCHASE_ADD') || can('FUEL_ISSUANCE_ADD') || can('FUEL_PURCHASE_EDIT') || can('FUEL_ISSUANCE_EDIT') || can('FUEL_ADJUST') || can('FUEL_EXPORT') || can('FUEL_EQUIPMENT_MANAGE') || can('USER_GROUP_ACCESS_MANAGE')) {
      items.push(
        {
          id: 'fuel-management',
          label: 'Fuel Management',
          icon: <Droplet size={18} />,
        },
      );
    }

    if (can('HAULER_OFFSET_LEDGER_VIEW') || can('HAULER_OFFSET_LEDGER_ADD') || can('HAULER_OFFSET_LEDGER_ADJUST') || can('CUSTOMER_CREDIT_VIEW') || can('CUSTOMER_CREDIT_ADD') || can('CUSTOMER_CREDIT_ADJUST') || can('USER_GROUP_ACCESS_MANAGE')) {
      items.push(
        {
          id: 'hauler-offset-ledger',
          label: 'Accounts Ledger',
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

    return items;
  }, [can]);

  // Top-level entries that do not belong to Sales or Operations.
  const standaloneItems = useMemo<MenuItem[]>(() => (
    can('USER_GROUP_ACCESS_VIEW') || can('USER_GROUP_ACCESS_MANAGE') || can('USER_ACCOUNTS_MANAGE') || can('AUDIT_LOG_VIEW')
      ? [{ id: 'access-control' as const, label: 'Access Control', icon: <ShieldCheck size={18} /> }]
      : []
  ), [can]);

  const operationsItems = useMemo<MenuItem[]>(() => {
    const canViewOperationsDashboard = can('OPERATIONS_DASHBOARD_VIEW') || can('USER_GROUP_ACCESS_MANAGE');
    const moduleChildren = [
      ...(can('SC_OPERATIONS_VIEW') || can('SC_OPERATIONS_ADD') || can('SC_OPERATIONS_EDIT') || can('USER_GROUP_ACCESS_MANAGE')
        ? [{ id: 'operations-stone-crusher' as const, label: 'Stone Crusher', icon: <Factory size={15} /> }]
        : []),
      ...(can('SW_OPERATIONS_VIEW') || can('SW_OPERATIONS_ADD') || can('SW_OPERATIONS_EDIT') || can('USER_GROUP_ACCESS_MANAGE')
        ? [{ id: 'operations-sand-washing' as const, label: 'Sand Washing', icon: <Waves size={15} /> }]
        : []),
      ...(can('QS_OPERATIONS_VIEW') || can('QS_OPERATIONS_ADD') || can('QS_OPERATIONS_EDIT') || can('USER_GROUP_ACCESS_MANAGE')
        ? [{ id: 'operations-quarry-site' as const, label: 'Quarry Site', icon: <Mountain size={15} /> }]
        : []),
      ...(can('WB_OPERATIONS_VIEW') || can('WB_OPERATIONS_ADD') || can('WB_OPERATIONS_EDIT') || can('USER_GROUP_ACCESS_MANAGE')
        ? [{ id: 'operations-wobbler' as const, label: 'Wobbler', icon: <Cog size={15} /> }]
        : []),
    ];

    if (!canViewOperationsDashboard && moduleChildren.length === 0) return [];

    const children = [
      ...(canViewOperationsDashboard
        ? [{ id: 'operations-dashboard' as const, label: 'Dashboard', icon: <LayoutDashboard size={15} /> }]
        : []),
      ...moduleChildren,
    ];

    return [
      {
        id: 'operations',
        label: 'Daily Operations',
        icon: <Settings size={18} />,
        children,
      },
    ];
  }, [can]);

  const menuCategories = useMemo<MenuCategory[]>(() => {
    const categories: MenuCategory[] = [
      {
        id: 'sales',
        label: 'Sales',
        icon: <Briefcase size={18} />,
        items: salesItems,
      },
      {
        id: 'operations',
        label: 'Operations',
        icon: <Settings size={18} />,
        items: operationsItems,
      },
    ];

    return categories.filter(category => category.items.length > 0);
  }, [operationsItems, salesItems]);

  const flatMenuItems = useMemo(
    () => [...menuCategories.flatMap(category => category.items), ...standaloneItems],
    [menuCategories, standaloneItems],
  );

  const [openCategory, setOpenCategory] = useState<SidebarCategoryId | null>(activeSection.startsWith('operations') ? 'operations' : 'sales');
  const [openGroup, setOpenGroup] = useState<string | null>(() => getOpenGroupForSection(activeSection));
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Every page the user can open, flattened for search.
  const searchEntries = useMemo<SearchEntry[]>(() => [
    ...menuCategories.flatMap(category => category.items.flatMap(item => (
      item.children
        ? item.children.map(child => ({ id: child.id, label: child.label, path: `${category.label} › ${item.label}`, icon: child.icon }))
        : [{ id: item.id, label: item.label, path: category.label, icon: item.icon }]
    ))),
    ...standaloneItems.map(item => ({ id: item.id, label: item.label, path: 'System', icon: item.icon })),
  ].map(leaf => ({
    ...leaf,
    haystack: `${leaf.label} ${leaf.path} ${SEARCH_KEYWORDS[leaf.id] ?? ''}`.toLowerCase(),
  })), [menuCategories, standaloneItems]);

  const searchResults = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    return searchEntries
      .filter(entry => words.every(word => entry.haystack.includes(word)))
      .sort((a, b) => Number(!a.label.toLowerCase().startsWith(words[0])) - Number(!b.label.toLowerCase().startsWith(words[0])));
  }, [query, searchEntries]);

  useEffect(() => { setHighlighted(0); }, [query]);

  // Ctrl+K (or Cmd+K) focuses the search from anywhere.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCollapsed(false);
        window.setTimeout(() => searchInputRef.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const openSearchResult = (entry: SearchEntry) => {
    onNavigate(entry.id);
    setQuery('');
    searchInputRef.current?.blur();
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted(index => Math.min(index + 1, Math.max(searchResults.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted(index => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      const entry = searchResults[highlighted];
      if (entry) openSearchResult(entry);
    } else if (event.key === 'Escape') {
      setQuery('');
      event.currentTarget.blur();
    }
  };

  useEffect(() => {
    if (activeSection === 'access-control') return;
    setOpenCategory(activeSection.startsWith('operations') ? 'operations' : 'sales');
    setOpenGroup(getOpenGroupForSection(activeSection));
  }, [activeSection]);

  const isGroupActive = (item: MenuItem) => {
    if (!item.children) return activeSection === item.id;
    return item.children.some(c => c.id === activeSection);
  };

  const isCategoryActive = (category: MenuCategory) => {
    return category.items.some(item => isGroupActive(item));
  };

  const toggleGroup = (id: string) => {
    setOpenGroup(prev => (prev === id ? null : id));
  };

  const toggleCategory = (id: SidebarCategoryId) => {
    setOpenCategory(prev => (prev === id ? null : id));
  };

  const handleGroupClick = (item: MenuItem) => {
    if (!collapsed) {
      toggleGroup(item.id);
      return;
    }

    const activeChild = item.children?.find(child => child.id === activeSection);
    onNavigate(activeChild?.id ?? item.children?.[0]?.id ?? item.id);
  };

  const renderMenuItem = (item: MenuItem, nested = false) => {
    const hasChildren = !!item.children;
    const isOpen = !collapsed && openGroup === item.id;
    const groupActive = isGroupActive(item);

    if (!hasChildren) {
      return (
        <button
          key={item.id}
          onClick={() => onNavigate(item.id)}
          title={collapsed ? item.label : undefined}
          className={`w-full flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'} ${nested ? 'py-2 rounded-md' : 'py-2.5 rounded-lg'} text-sm font-medium transition-colors ${
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
          className={`w-full flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'} ${nested ? 'py-2 rounded-md' : 'py-2.5 rounded-lg'} text-sm font-medium transition-colors ${
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

      <div className="px-3 pt-2">
        {collapsed ? (
          <button
            type="button"
            onClick={() => {
              setCollapsed(false);
              window.setTimeout(() => searchInputRef.current?.focus(), 0);
            }}
            title="Search menu (Ctrl+K)"
            className="w-full flex items-center justify-center py-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
          >
            <Search size={17} />
          </button>
        ) : (
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search menu…"
              aria-label="Search menu"
              className="w-full rounded-lg border border-slate-800 bg-slate-900 py-2 pl-9 pr-14 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20"
            />
            {query ? (
              <button
                type="button"
                onClick={() => { setQuery(''); searchInputRef.current?.focus(); }}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-slate-200"
              >
                <X size={14} />
              </button>
            ) : (
              <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-slate-700 px-1.5 text-[10px] font-medium text-slate-500">Ctrl K</kbd>
            )}
          </div>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {!collapsed && query.trim() ? (
          searchResults.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-500">No page matches “{query.trim()}”.</p>
          ) : (
            <div className="space-y-0.5" role="listbox" aria-label="Search results">
              {searchResults.map((entry, index) => (
                <button
                  key={`${entry.id}-${entry.path}`}
                  type="button"
                  role="option"
                  aria-selected={index === highlighted}
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => openSearchResult(entry)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                    index === highlighted ? 'bg-slate-800/80 text-slate-100' : 'text-slate-400 hover:bg-slate-800/60'
                  }`}
                >
                  <span className={activeSection === entry.id ? 'text-emerald-400' : 'text-slate-500'}>{entry.icon}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{entry.label}</span>
                    <span className="block truncate text-[11px] text-slate-500">{entry.path}</span>
                  </span>
                </button>
              ))}
            </div>
          )
        ) : collapsed ? (
          flatMenuItems.map(item => renderMenuItem(item))
        ) : (
          menuCategories.map(category => {
            const isOpen = openCategory === category.id;
            const categoryActive = isCategoryActive(category);

            return (
              <div key={category.id} className="space-y-0.5">
                <button
                  onClick={() => toggleCategory(category.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                    categoryActive
                      ? 'bg-slate-900 text-emerald-400'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                  }`}
                >
                  <span className={categoryActive ? 'text-emerald-400' : 'text-slate-400'}>{category.icon}</span>
                  <span className="flex-1 text-left">{category.label}</span>
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>

                {isOpen && (
                  <div className="ml-3 mt-1 space-y-0.5 pl-3 border-l border-slate-800">
                    {category.items.map(item => renderMenuItem(item, true))}
                  </div>
                )}
              </div>
            );
          }).concat(standaloneItems.length > 0 ? [
            <div key="standalone" className="mt-2 space-y-0.5 border-t border-slate-800 pt-2">
              {standaloneItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                    activeSection === item.id
                      ? 'bg-slate-900 text-emerald-400'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                  }`}
                >
                  <span className={activeSection === item.id ? 'text-emerald-400' : 'text-slate-400'}>{item.icon}</span>
                  <span className="flex-1 text-left">{item.label}</span>
                </button>
              ))}
            </div>,
          ] : [])
        )}
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
