import { useEffect, useMemo, useState } from 'react';
import { CheckCheck, Copy, Eye, EyeOff, History, KeyRound, Loader2, RefreshCcw, RefreshCw, Save, Search, ShieldCheck, UserPlus } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { AccessActivity, AccessModule, AccessSubModule, ActivityCode, AppUser, AuditLog, UserGroup, UserGroupActivity, UserRole } from '../lib/database.types';
import Pagination from './Pagination';
import { paginate } from '../lib/pagination';

const USERS_PAGE_SIZE = 8;
const AUDIT_PAGE_SIZE = 10;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

type ActivityTree = AccessActivity;
type SubModuleTree = AccessSubModule & { sys_activity?: ActivityTree[] };
type ModuleTree = AccessModule & { sys_sub_module?: SubModuleTree[] };
type MappingRow = UserGroupActivity;

const FALLBACK_GROUPS: Pick<UserGroup, 'code' | 'name'>[] = [
  { code: 'manager', name: 'Manager' },
  { code: 'operator', name: 'Operator' },
];

function generatePassword(length = 12): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*()-_=+';
  const result: string[] = [];
  const maxValid = Math.floor(256 / chars.length) * chars.length;
  while (result.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (b < maxValid && result.length < length) result.push(chars[b % chars.length]);
    }
  }
  return result.join('');
}

function formatTableName(tableName: string) {
  return tableName.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function describeAudit(log: AuditLog) {
  if (log.action === 'INSERT') return 'Created record';
  if (log.action === 'DELETE') return 'Deleted record';

  const oldData = log.old_data ?? {};
  const newData = log.new_data ?? {};
  const changed = Object.keys(newData).filter(key => JSON.stringify(oldData[key]) !== JSON.stringify(newData[key]));
  return changed.length === 0 ? 'Updated record' : `Changed ${changed.slice(0, 3).join(', ')}`;
}

function getMappedCodes(groupId: string, mappings: MappingRow[], activities: AccessActivity[]) {
  const activityCodeById = new Map(activities.map(activity => [activity.id, activity.code]));
  return new Set(
    mappings
      .filter(mapping => mapping.user_group_id === groupId && mapping.is_active)
      .map(mapping => activityCodeById.get(mapping.activity_id))
      .filter((code): code is ActivityCode => !!code)
  );
}

export default function AccessControl() {
  const { user, can, refreshProfile } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [modules, setModules] = useState<ModuleTree[]>([]);
  const [activities, setActivities] = useState<AccessActivity[]>([]);
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedActivityCodes, setSelectedActivityCodes] = useState<Set<ActivityCode>>(new Set());
  const [loading, setLoading] = useState(true);
  const [savingAccess, setSavingAccess] = useState(false);
  const [accessMessage, setAccessMessage] = useState('');
  const [accessError, setAccessError] = useState('');
  const [permissionSearch, setPermissionSearch] = useState('');
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [usersPage, setUsersPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);

  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState(generatePassword());
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);

  const canManageAccess = can('USER_GROUP_ACCESS_MANAGE');
  const canViewAccess = can('USER_GROUP_ACCESS_VIEW') || canManageAccess;
  const canManageUsers = can('USER_ACCOUNTS_MANAGE');
  const canViewAudit = can('AUDIT_LOG_VIEW');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    setAccessError('');

    const usersQuery = canManageUsers
      ? supabase.from('app_users').select('*').order('created_at', { ascending: true })
      : Promise.resolve({ data: [] });
    const logsQuery = canViewAudit
      ? supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(40)
      : Promise.resolve({ data: [] });
    const groupsQuery = canViewAccess
      ? supabase.from('sys_user_group').select('*').eq('is_active', true).order('name')
      : Promise.resolve({ data: [] });
    const modulesQuery = canViewAccess
      ? supabase
          .from('sys_module')
          .select('*')
          .eq('is_active', true)
          .order('sort_order')
      : Promise.resolve({ data: [] });
    const subModulesQuery = canViewAccess
      ? supabase
          .from('sys_sub_module')
          .select('*')
          .eq('is_active', true)
          .order('sort_order')
      : Promise.resolve({ data: [] });
    const activitiesQuery = canViewAccess
      ? supabase
          .from('sys_activity')
          .select('*')
          .eq('is_active', true)
          .order('sort_order')
      : Promise.resolve({ data: [] });
    const mappingsQuery = canViewAccess
      ? supabase
          .from('sys_map_user_group_activity')
          .select('*')
          .eq('is_active', true)
      : Promise.resolve({ data: [] });

    const [
      { data: usersData },
      { data: logsData },
      { data: groupsData },
      { data: modulesData },
      { data: subModulesData },
      { data: activitiesData },
      { data: mappingsData },
    ] = await Promise.all([
      usersQuery,
      logsQuery,
      groupsQuery,
      modulesQuery,
      subModulesQuery,
      activitiesQuery,
      mappingsQuery,
    ]);

    const nextGroups = (groupsData ?? []) as UserGroup[];
    const nextSubModules = (subModulesData ?? []) as AccessSubModule[];
    const nextActivities = (activitiesData ?? []) as AccessActivity[];
    const nextMappings = (mappingsData ?? []) as MappingRow[];
    const nextSelectedGroupId = selectedGroupId || nextGroups[0]?.id || '';
    const nextModules = ((modulesData ?? []) as AccessModule[]).map(module => ({
      ...module,
      sys_sub_module: nextSubModules
        .filter(subModule => subModule.module_id === module.id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(subModule => ({
          ...subModule,
          sys_activity: nextActivities
            .filter(activity => activity.sub_module_id === subModule.id)
            .sort((a, b) => a.sort_order - b.sort_order),
        })),
    }));

    setUsers((usersData ?? []) as AppUser[]);
    setAuditLogs((logsData ?? []) as AuditLog[]);
    setGroups(nextGroups);
    setModules(nextModules);
    setActivities(nextActivities);
    setMappings(nextMappings);
    setSelectedGroupId(nextSelectedGroupId);
    setSelectedActivityCodes(nextSelectedGroupId ? getMappedCodes(nextSelectedGroupId, nextMappings, nextActivities) : new Set());
    setLoading(false);
  }

  function handleGroupChange(groupId: string) {
    setSelectedGroupId(groupId);
    setSelectedActivityCodes(getMappedCodes(groupId, mappings, activities));
    setAccessMessage('');
    setAccessError('');
  }

  function toggleActivity(code: ActivityCode) {
    if (!canManageAccess) return;
    setSelectedActivityCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
    setAccessMessage('');
  }

  function setSubModuleActivities(activities: ActivityTree[], checked: boolean) {
    if (!canManageAccess) return;
    setSelectedActivityCodes(prev => {
      const next = new Set(prev);
      activities.forEach(activity => {
        if (checked) next.add(activity.code);
        else next.delete(activity.code);
      });
      return next;
    });
  }

  async function handleSaveAccess() {
    if (!selectedGroupId || !canManageAccess) return;
    setSavingAccess(true);
    setAccessMessage('');
    setAccessError('');

    const { error } = await supabase.rpc('save_user_group_activities', {
      target_user_group_id: selectedGroupId,
      activity_codes: Array.from(selectedActivityCodes),
    });

    if (error) {
      setAccessError(error.message);
    } else {
      setAccessMessage('Permissions saved.');
      await fetchData();
      await refreshProfile();
    }
    setSavingAccess(false);
  }

  async function handleRoleChange(targetUser: AppUser, role: UserRole) {
    if (!canManageUsers || targetUser.role === role) return;

    setSavingUserId(targetUser.id);
    const { data } = await supabase
      .from('app_users')
      .update({ role })
      .eq('id', targetUser.id)
      .select()
      .maybeSingle();

    if (data) {
      setUsers(prev => prev.map(item => item.id === targetUser.id ? data as AppUser : item));
      await fetchData();
    }
    setSavingUserId(null);
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');

    if (!canManageUsers) {
      setCreateError('Not authorized to create accounts.');
      return;
    }
    if (!newEmail.trim()) {
      setCreateError('Email is required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
      setCreateError('Please enter a valid email address');
      return;
    }
    if (newPassword.length < 6) {
      setCreateError('Password must be at least 6 characters');
      return;
    }

    setCreating(true);
    const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { error } = await tempClient.auth.signUp({ email: newEmail.trim(), password: newPassword });
    setCreating(false);

    if (error) {
      setCreateError(error.message);
    } else {
      setCreatedCredentials({ email: newEmail.trim(), password: newPassword });
      setNewEmail('');
      setNewPassword(generatePassword());
      await fetchData();
    }
  }

  async function copyToClipboard(text: string, type: 'email' | 'password') {
    if (!navigator.clipboard) {
      setCreateError('Clipboard not available - please copy manually.');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'email') {
        setCopiedEmail(true);
        setTimeout(() => setCopiedEmail(false), 2000);
      } else {
        setCopiedPassword(true);
        setTimeout(() => setCopiedPassword(false), 2000);
      }
    } catch {
      setCreateError('Could not copy to clipboard - please copy manually.');
    }
  }

  const usersTotalPages = Math.max(1, Math.ceil(users.length / USERS_PAGE_SIZE));
  const currentUsersPage = Math.min(usersPage, usersTotalPages);
  const pagedUsers = useMemo(() => paginate(users, currentUsersPage, USERS_PAGE_SIZE), [users, currentUsersPage]);
  const auditTotalPages = Math.max(1, Math.ceil(auditLogs.length / AUDIT_PAGE_SIZE));
  const currentAuditPage = Math.min(auditPage, auditTotalPages);
  const pagedAuditLogs = useMemo(() => paginate(auditLogs, currentAuditPage, AUDIT_PAGE_SIZE), [auditLogs, currentAuditPage]);

  const filteredModules = useMemo(() => {
    const q = permissionSearch.trim().toLowerCase();
    return modules
      .map(module => ({
        ...module,
        sys_sub_module: (module.sys_sub_module ?? [])
          .filter(subModule => subModule.is_active)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(subModule => ({
            ...subModule,
            sys_activity: (subModule.sys_activity ?? [])
              .filter(activity => activity.is_active)
              .sort((a, b) => a.sort_order - b.sort_order),
          }))
          .filter(subModule => {
            if (!q) return true;
            return module.name.toLowerCase().includes(q) ||
              subModule.name.toLowerCase().includes(q) ||
              (subModule.sys_activity ?? []).some(activity => `${activity.name} ${activity.code} ${activity.action}`.toLowerCase().includes(q));
          }),
      }))
      .filter(module => (module.sys_sub_module ?? []).length > 0);
  }, [modules, permissionSearch]);

  const selectedGroup = groups.find(group => group.id === selectedGroupId);
  const selectedCount = selectedActivityCodes.size;
  const roleOptions = groups.length > 0 ? groups : FALLBACK_GROUPS;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Access Control</h1>
          <p className="text-slate-500 text-sm mt-0.5">Manage user accounts, group permissions, and access audit activity.</p>
        </div>
        <button onClick={fetchData} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {canViewAccess && (
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <KeyRound size={18} className="text-emerald-600" />
            <div>
              <h2 className="font-semibold text-slate-800">User Group Access</h2>
              <p className="text-xs text-slate-500">Select a group, then check the modules and actions it can access.</p>
            </div>
          </div>

          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_auto] gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">User Group</label>
                <select
                  value={selectedGroupId}
                  onChange={event => handleGroupChange(event.target.value)}
                  disabled={loading || groups.length === 0}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                >
                  {groups.map(group => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Search Permissions</label>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={permissionSearch}
                    onChange={event => setPermissionSearch(event.target.value)}
                    placeholder="Search module, action, or code..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
              </div>

              {canManageAccess && (
                <button
                  onClick={handleSaveAccess}
                  disabled={savingAccess || !selectedGroupId}
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-70 text-white text-sm font-semibold transition-colors"
                >
                  {savingAccess ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  Save Access
                </button>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{selectedGroup?.name ?? 'No group selected'}: {selectedCount} permission{selectedCount === 1 ? '' : 's'} selected</span>
              {!canManageAccess && <span>View-only access</span>}
            </div>

            {accessError && <p className="text-sm text-red-600">{accessError}</p>}
            {accessMessage && <p className="text-sm text-emerald-700">{accessMessage}</p>}

            {loading ? (
              <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
                <RefreshCw size={16} className="animate-spin" /> Loading permissions...
              </div>
            ) : filteredModules.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-sm">No permissions found.</div>
            ) : (
              <div className="space-y-4">
                {filteredModules.map(module => (
                  <div key={module.id} className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                      <h3 className="font-semibold text-slate-800">{module.name}</h3>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {(module.sys_sub_module ?? []).map(subModule => {
                        const activities = subModule.sys_activity ?? [];
                        const allChecked = activities.length > 0 && activities.every(activity => selectedActivityCodes.has(activity.code));
                        return (
                          <div key={subModule.id} className="p-4">
                            <div className="flex items-center justify-between gap-3 mb-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-700">{subModule.name}</p>
                                {subModule.nav_section && <p className="text-xs text-slate-400">{subModule.nav_section}</p>}
                              </div>
                              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                                <input
                                  type="checkbox"
                                  checked={allChecked}
                                  disabled={!canManageAccess || activities.length === 0}
                                  onChange={event => setSubModuleActivities(activities, event.target.checked)}
                                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                />
                                Select All
                              </label>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                              {activities.map(activity => (
                                <label key={activity.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${selectedActivityCodes.has(activity.code) ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600'}`}>
                                  <input
                                    type="checkbox"
                                    checked={selectedActivityCodes.has(activity.code)}
                                    disabled={!canManageAccess}
                                    onChange={() => toggleActivity(activity.code)}
                                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                  />
                                  <span className="truncate" title={activity.code}>{activity.name}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {canManageUsers && (
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <UserPlus size={18} className="text-emerald-600" />
            <div>
              <h2 className="font-semibold text-slate-800">Create User Account</h2>
              <p className="text-xs text-slate-500">Create a new account and share the credentials with the user.</p>
            </div>
          </div>

          <div className="px-5 py-5">
            {createdCredentials ? (
              <div className="space-y-4">
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
                  <p className="text-sm font-semibold text-emerald-800 mb-3">Account created. Share these credentials with the user:</p>
                  {(['email', 'password'] as const).map(type => (
                    <div key={type} className="flex items-center justify-between gap-3 bg-white rounded-lg border border-emerald-200 px-3 py-2 mb-2">
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500 font-medium">{type === 'email' ? 'Email' : 'Password'}</p>
                        <p className={`text-sm font-semibold text-slate-800 truncate ${type === 'password' ? 'font-mono' : ''}`}>
                          {createdCredentials[type]}
                        </p>
                      </div>
                      <button type="button" onClick={() => copyToClipboard(createdCredentials[type], type)} className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors">
                        {(type === 'email' ? copiedEmail : copiedPassword) ? <CheckCheck size={13} /> : <Copy size={13} />}
                        {(type === 'email' ? copiedEmail : copiedPassword) ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => setCreatedCredentials(null)} className="w-full py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                  Create Another Account
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreateAccount} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email Address</label>
                    <input type="email" value={newEmail} onChange={e => { setNewEmail(e.target.value); setCreateError(''); }} placeholder="user@example.com" disabled={creating} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 transition-shadow" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Password</label>
                    <div className="relative">
                      <input type={showNewPassword ? 'text' : 'password'} value={newPassword} onChange={e => { setNewPassword(e.target.value); setCreateError(''); }} placeholder="Min. 6 characters" disabled={creating} className="w-full pl-3 pr-20 py-2 rounded-lg border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 transition-shadow font-mono" />
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                        <button type="button" onClick={() => setShowNewPassword(v => !v)} className="p-1.5 rounded text-slate-400 hover:text-slate-600 transition-colors" tabIndex={-1}>
                          {showNewPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button type="button" onClick={() => setNewPassword(generatePassword())} className="p-1.5 rounded text-slate-400 hover:text-emerald-600 transition-colors" title="Generate new password" tabIndex={-1}>
                          <RefreshCcw size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {createError && <p className="text-xs text-red-600">{createError}</p>}

                <button type="submit" disabled={creating} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-70 text-white text-sm font-semibold transition-colors">
                  {creating ? <><Loader2 size={15} className="animate-spin" /> Creating...</> : <><UserPlus size={15} /> Create Account</>}
                </button>
              </form>
            )}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {canManageUsers && (
          <section className="xl:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <ShieldCheck size={18} className="text-emerald-600" />
              <div>
                <h2 className="font-semibold text-slate-800">User Roles</h2>
                <p className="text-xs text-slate-500">Assign each user to a database-backed user group.</p>
              </div>
            </div>

            {loading ? (
              <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
                <RefreshCw size={16} className="animate-spin" /> Loading users...
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {pagedUsers.map(appUser => {
                  const isCurrentUser = appUser.id === user?.id;
                  return (
                    <div key={appUser.id} className="px-5 py-4 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{appUser.email}</p>
                        <p className="text-xs text-slate-400 mt-1">
                          Joined {new Date(appUser.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {isCurrentUser ? ' - You' : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {savingUserId === appUser.id && <Loader2 size={14} className="animate-spin text-slate-400" />}
                        <select value={appUser.role} disabled={savingUserId === appUser.id || isCurrentUser} onChange={event => handleRoleChange(appUser, event.target.value as UserRole)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:bg-slate-50 disabled:text-slate-400">
                          {roleOptions.map(group => (
                            <option key={group.code} value={group.code}>{group.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
                <Pagination page={currentUsersPage} pageSize={USERS_PAGE_SIZE} totalItems={users.length} onPageChange={setUsersPage} />
              </div>
            )}
          </section>
        )}

        {canViewAudit && (
          <section className={`${canManageUsers ? 'xl:col-span-3' : 'xl:col-span-5'} bg-white rounded-xl border border-slate-200 overflow-hidden`}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <History size={18} className="text-sky-600" />
              <div>
                <h2 className="font-semibold text-slate-800">Audit Log</h2>
                <p className="text-xs text-slate-500">Latest inserts, updates, and deletes across operational records.</p>
              </div>
            </div>

            {loading ? (
              <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
                <RefreshCw size={16} className="animate-spin" /> Loading activity...
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="py-16 text-center text-slate-500 text-sm">No audit activity yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">When</th>
                      <th className="px-4 py-3 text-left">Actor</th>
                      <th className="px-4 py-3 text-left">Table</th>
                      <th className="px-4 py-3 text-left">Action</th>
                      <th className="px-4 py-3 text-left">Summary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedAuditLogs.map(log => (
                      <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{log.actor_email ?? 'System'}</td>
                        <td className="px-4 py-3 text-slate-600">{formatTableName(log.table_name)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${log.action === 'INSERT' ? 'bg-emerald-50 text-emerald-700' : log.action === 'UPDATE' ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{describeAudit(log)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination page={currentAuditPage} pageSize={AUDIT_PAGE_SIZE} totalItems={auditLogs.length} onPageChange={setAuditPage} />
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
