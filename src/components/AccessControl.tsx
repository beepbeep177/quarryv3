import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ShieldCheck, History, Loader2, UserPlus, Eye, EyeOff, Copy, CheckCheck, RefreshCcw } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { AppUser, AuditLog, UserRole } from '../lib/database.types';
import Pagination from './Pagination';
import { paginate } from '../lib/pagination';

const USERS_PAGE_SIZE = 8;
const AUDIT_PAGE_SIZE = 10;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function generatePassword(length = 12): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*()-_=+';
  const result: string[] = [];
  // Use rejection sampling to eliminate modulo bias
  const maxValid = Math.floor(256 / chars.length) * chars.length;
  while (result.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (b < maxValid && result.length < length) {
        result.push(chars[b % chars.length]);
      }
    }
  }
  return result.join('');
}

function formatTableName(tableName: string) {
  return tableName
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function describeAudit(log: AuditLog) {
  if (log.action === 'INSERT') {
    return 'Created record';
  }

  if (log.action === 'DELETE') {
    return 'Deleted record';
  }

  const oldData = log.old_data ?? {};
  const newData = log.new_data ?? {};
  const changed = Object.keys(newData).filter(key => JSON.stringify(oldData[key]) !== JSON.stringify(newData[key]));

  if (changed.length === 0) {
    return 'Updated record';
  }

  return `Changed ${changed.slice(0, 3).join(', ')}`;
}

export default function AccessControl() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [usersPage, setUsersPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);

  // Create account state
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState(generatePassword());
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const [{ data: usersData }, { data: logsData }] = await Promise.all([
      supabase.from('app_users').select('*').order('created_at', { ascending: true }),
      supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(40),
    ]);

    setUsers((usersData ?? []) as AppUser[]);
    setAuditLogs((logsData ?? []) as AuditLog[]);
    setLoading(false);
  }

  async function handleRoleChange(targetUser: AppUser, role: UserRole) {
    if (targetUser.role === role) {
      return;
    }

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

  const usersTotalPages = Math.max(1, Math.ceil(users.length / USERS_PAGE_SIZE));
  const currentUsersPage = Math.min(usersPage, usersTotalPages);
  const pagedUsers = useMemo(() => paginate(users, currentUsersPage, USERS_PAGE_SIZE), [users, currentUsersPage]);
  const auditTotalPages = Math.max(1, Math.ceil(auditLogs.length / AUDIT_PAGE_SIZE));
  const currentAuditPage = Math.min(auditPage, auditTotalPages);
  const pagedAuditLogs = useMemo(() => paginate(auditLogs, currentAuditPage, AUDIT_PAGE_SIZE), [auditLogs, currentAuditPage]);

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');

    if (!newEmail.trim()) {
      setCreateError('Email is required');
      return;
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(newEmail.trim())) {
      setCreateError('Please enter a valid email address');
      return;
    }
    if (newPassword.length < 6) {
      setCreateError('Password must be at least 6 characters');
      return;
    }

    setCreating(true);
    // Use a separate client with no session persistence so the manager's
    // current session is NOT replaced when the new user account is created.
    const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { error } = await tempClient.auth.signUp({
      email: newEmail.trim(),
      password: newPassword,
    });

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Access Control</h1>
          <p className="text-slate-500 text-sm mt-0.5">Assign operator or manager roles and review the latest record activity.</p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Create Account Section */}
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
                <p className="text-sm font-semibold text-emerald-800 mb-3">✓ Account created! Share these credentials with the user:</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3 bg-white rounded-lg border border-emerald-200 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500 font-medium">Email</p>
                      <p className="text-sm font-semibold text-slate-800 truncate">{createdCredentials.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(createdCredentials.email, 'email')}
                      className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
                    >
                      {copiedEmail ? <CheckCheck size={13} /> : <Copy size={13} />}
                      {copiedEmail ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-3 bg-white rounded-lg border border-emerald-200 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500 font-medium">Password</p>
                      <p className="text-sm font-mono font-semibold text-slate-800 truncate">{createdCredentials.password}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(createdCredentials.password, 'password')}
                      className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
                    >
                      {copiedPassword ? <CheckCheck size={13} /> : <Copy size={13} />}
                      {copiedPassword ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCreatedCredentials(null)}
                className="w-full py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Create Another Account
              </button>
            </div>
          ) : (
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email Address</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={e => { setNewEmail(e.target.value); setCreateError(''); }}
                    placeholder="user@example.com"
                    disabled={creating}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 transition-shadow"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Password</label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={e => { setNewPassword(e.target.value); setCreateError(''); }}
                      placeholder="Min. 6 characters"
                      disabled={creating}
                      className="w-full pl-3 pr-20 py-2 rounded-lg border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 transition-shadow font-mono"
                    />
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(v => !v)}
                        className="p-1.5 rounded text-slate-400 hover:text-slate-600 transition-colors"
                        tabIndex={-1}
                      >
                        {showNewPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewPassword(generatePassword())}
                        className="p-1.5 rounded text-slate-400 hover:text-emerald-600 transition-colors"
                        title="Generate new password"
                        tabIndex={-1}
                      >
                        <RefreshCcw size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {createError && (
                <p className="text-xs text-red-600">{createError}</p>
              )}

              <button
                type="submit"
                disabled={creating}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-70 text-white text-sm font-semibold transition-colors"
              >
                {creating ? (
                  <><Loader2 size={15} className="animate-spin" /> Creating...</>
                ) : (
                  <><UserPlus size={15} /> Create Account</>
                )}
              </button>
            </form>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <section className="xl:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <ShieldCheck size={18} className="text-emerald-600" />
            <div>
              <h2 className="font-semibold text-slate-800">User Roles</h2>
              <p className="text-xs text-slate-500">Operators can edit Customers and Trucks only; all other sections are restricted or view-only.</p>
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
                        {isCurrentUser ? ' • You' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {savingUserId === appUser.id && <Loader2 size={14} className="animate-spin text-slate-400" />}
                      <select
                        value={appUser.role}
                        disabled={savingUserId === appUser.id || isCurrentUser}
                        onChange={event => handleRoleChange(appUser, event.target.value as UserRole)}
                        className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:bg-slate-50 disabled:text-slate-400"
                      >
                        <option value="manager">Manager</option>
                        <option value="operator">Operator</option>
                      </select>
                    </div>
                  </div>
                );
              })}
              <Pagination page={currentUsersPage} pageSize={USERS_PAGE_SIZE} totalItems={users.length} onPageChange={setUsersPage} />
            </div>
          )}
        </section>

        <section className="xl:col-span-3 bg-white rounded-xl border border-slate-200 overflow-hidden">
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
                        {new Date(log.created_at).toLocaleString('en-PH', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{log.actor_email ?? 'System'}</td>
                      <td className="px-4 py-3 text-slate-600">{formatTableName(log.table_name)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
                          log.action === 'INSERT'
                            ? 'bg-emerald-50 text-emerald-700'
                            : log.action === 'UPDATE'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-red-50 text-red-700'
                        }`}>
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
      </div>
    </div>
  );
}
