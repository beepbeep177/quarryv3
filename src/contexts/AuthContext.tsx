import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { ActivityCode, AppUser, UserRole } from '../lib/database.types';

interface AuthContextType {
  session: Session | null;
  user: Session['user'] | null;
  profile: AppUser | null;
  role: UserRole | null;
  permissions: Set<ActivityCode>;
  isManager: boolean;
  loading: boolean;
  can: (activityCode: ActivityCode) => boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [permissions, setPermissions] = useState<Set<ActivityCode>>(new Set());
  const [loading, setLoading] = useState(true);

  const loadPermissions = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_my_activity_codes');

    if (error) {
      setPermissions(new Set());
      return;
    }

    setPermissions(new Set((data ?? []) as ActivityCode[]));
  }, []);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      setPermissions(new Set());
      return;
    }

    const { data } = await supabase
      .from('app_users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (data) {
      const appUser = data as AppUser;
      setProfile(appUser);
      await loadPermissions();
      return;
    }

    // Profile not found – user pre-dates the roles migration or trigger missed them.
    // Auto-register via SECURITY DEFINER RPC (first caller becomes manager).
    const { data: created, error: rpcError } = await supabase.rpc('ensure_user_profile');
    if (!rpcError) {
      const appUser = (created ?? null) as AppUser | null;
      setProfile(appUser);
      await loadPermissions();
    } else {
      console.error('ensure_user_profile RPC failed:', rpcError.message);
      setProfile(null);
      setPermissions(new Set());
    }
  }, [loadPermissions]);

  useEffect(() => {
    let active = true;

    async function initialize() {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!active) return;

      setSession(currentSession);
      await loadProfile(currentSession?.user.id);
      if (active) setLoading(false);
    }

    initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(true);
      loadProfile(nextSession?.user.id).finally(() => {
        if (active) setLoading(false);
      });
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  useEffect(() => {
    if (!session?.user.id) return;

    const refreshCurrentUser = () => {
      if (document.visibilityState === 'visible') {
        loadProfile(session.user.id);
      }
    };

    window.addEventListener('focus', refreshCurrentUser);
    document.addEventListener('visibilitychange', refreshCurrentUser);

    return () => {
      window.removeEventListener('focus', refreshCurrentUser);
      document.removeEventListener('visibilitychange', refreshCurrentUser);
    };
  }, [loadProfile, session?.user.id]);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setProfile(null);
    setPermissions(new Set());
  }, []);

  const refreshProfile = useCallback(async () => {
    await loadProfile(session?.user.id);
  }, [loadProfile, session?.user.id]);

  const can = useCallback((activityCode: ActivityCode) => permissions.has(activityCode), [permissions]);

  const value = useMemo<AuthContextType>(() => ({
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.role ?? null,
    permissions,
    isManager: permissions.has('USER_GROUP_ACCESS_MANAGE'),
    loading,
    can,
    signUp,
    signIn,
    signOut,
    refreshProfile,
  }), [can, loading, permissions, profile, refreshProfile, session, signIn, signOut, signUp]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
