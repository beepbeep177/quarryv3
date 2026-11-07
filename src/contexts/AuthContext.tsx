import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { withTimeout } from '../lib/withTimeout';
import type { ActivityCode, AppUser, UserRole } from '../lib/database.types';

interface AuthContextType {
  session: Session | null;
  user: Session['user'] | null;
  profile: AppUser | null;
  role: UserRole | null;
  permissions: Set<ActivityCode>;
  isManager: boolean;
  loading: boolean;
  authError: string | null;
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

  const [sessionReady, setSessionReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const requestId = useRef(0);
  const invalidateProfileRequest = useCallback(() => { requestId.current++; }, []);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    const currentRequest = ++requestId.current;
    if (!userId) {
      setProfile(null);
      setPermissions(new Set());
      setAuthError(null);
      setLoading(false);
      return;
    }

    try {
      // Fetch data without changing state until the complete request succeeds.
      const result = await withTimeout((async () => {
        const { data, error } = await supabase.from('app_users')
          .select('*').eq('id', userId).maybeSingle();
        if (error) throw error;

        let appUser = data as AppUser | null;
        if (!appUser) {
          const { data: created, error: rpcError } = await supabase.rpc('ensure_user_profile');
          if (rpcError) throw rpcError;
          appUser = (created ?? null) as AppUser | null;
        }
        if (!appUser) throw new Error('Your user profile could not be loaded.');

        const { data: codes, error: permissionsError } = await supabase.rpc('get_my_activity_codes');
        if (permissionsError) throw permissionsError;
        return { appUser, codes: (codes ?? []) as ActivityCode[] };
      })(), 15000);

      if (currentRequest !== requestId.current) return;
      setProfile(result.appUser);
      setPermissions(new Set(result.codes));
      setAuthError(null);
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      console.error('Unable to load account access:', error);
      setProfile(null);
      setPermissions(new Set());
      setAuthError('Unable to load your account access. Check your connection and try again.');
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Auth callbacks only publish session state. Database calls run in the
    // separate effect below, after Supabase releases its auth lock.
    const timeout = window.setTimeout(() => {
      setAuthError('Your session is taking too long to load. Check your connection and try again.');
      setLoading(false);
    }, 15000);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      window.clearTimeout(timeout);
      setSession(nextSession);
      setSessionReady(true);
    });
    return () => {
      window.clearTimeout(timeout);
      subscription.unsubscribe();
      invalidateProfileRequest();
    };
  }, [invalidateProfileRequest]);

  const userId = session?.user.id;
  useEffect(() => {
    if (!sessionReady) return;
    setProfile(null);
    setPermissions(new Set());
    setLoading(true);
    void loadProfile(userId);
    return invalidateProfileRequest;
  }, [invalidateProfileRequest, loadProfile, sessionReady, userId]);

  useEffect(() => {
    if (!userId) return;
    // Focus and visibilitychange commonly fire together. Coalesce them without
    // hiding the current page or discarding an unsaved form.
    let timeout: number | undefined;
    const refreshCurrentUser = () => {
      window.clearTimeout(timeout);
      if (document.visibilityState === 'visible') {
        timeout = window.setTimeout(() => { void loadProfile(userId); }, 100);
      }
    };
    window.addEventListener('focus', refreshCurrentUser);
    document.addEventListener('visibilitychange', refreshCurrentUser);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('focus', refreshCurrentUser);
      document.removeEventListener('visibilitychange', refreshCurrentUser);
    };
  }, [loadProfile, userId]);

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
    authError,
    can,
    signUp,
    signIn,
    signOut,
    refreshProfile,
  }), [authError, can, loading, permissions, profile, refreshProfile, session, signIn, signOut, signUp]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
