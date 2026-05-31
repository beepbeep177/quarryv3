import { useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck, History, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { AppUser, AuditLog, UserRole } from '../lib/database.types';

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

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <section className="xl:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <ShieldCheck size={18} className="text-emerald-600" />
            <div>
              <h2 className="font-semibold text-slate-800">User Roles</h2>
              <p className="text-xs text-slate-500">Managers can edit records. Operators stay read-only.</p>
            </div>
          </div>

          {loading ? (
            <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
              <RefreshCw size={16} className="animate-spin" /> Loading users...
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {users.map(appUser => {
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
                  {auditLogs.map(log => (
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
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
