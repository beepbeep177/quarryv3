import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { AppUser, UserRole } from '../lib/database.types';

interface AuthContextType {
  session: Session | null;
  user: Session['user'] | null;
  profile: AppUser | null;
  role: UserRole | null;
  isManager: boolean;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      return;
    }

    const { data } = await supabase
      .from('app_users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (data) {
      setProfile(data as AppUser);
      return;
    }

    // Profile not found – user pre-dates the roles migration or trigger missed them.
    // Auto-register via SECURITY DEFINER RPC (first caller becomes manager).
    const { data: created, error: rpcError } = await supabase.rpc('ensure_user_profile');
    if (!rpcError) {
      setProfile((created ?? null) as AppUser | null);
    } else {
      console.error('ensure_user_profile RPC failed:', rpcError.message);
      setProfile(null);
    }
  }, []);

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
  }, []);

  const refreshProfile = useCallback(async () => {
    await loadProfile(session?.user.id);
  }, [loadProfile, session?.user.id]);

  const value = useMemo<AuthContextType>(() => ({
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.role ?? null,
    isManager: profile?.role === 'admin' || profile?.role === 'manager',
    loading,
    signUp,
    signIn,
    signOut,
    refreshProfile,
  }), [loading, profile, refreshProfile, session, signIn, signOut, signUp]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
