import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase } from '../lib/supabase';
import { isSupabaseConfigured } from '../lib/config';
import { isRecoveryCallback } from '../lib/auth/recovery';
import { ensureProfile } from '../lib/data';

interface AuthContextValue {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  error: string | null;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  recovery: boolean;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [loading, setLoading] = useState(configured);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(
    () => typeof window !== 'undefined' && isRecoveryCallback(window.location.href),
  );

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setLoading(false);
      return;
    }

    let mounted = true;
    sb.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = sb.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(next);
      if (next?.user) {
        void ensureProfile(next.user.id).catch(() => {
          /* profile may already exist via trigger */
        });
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase is not configured.');
    setError(null);
    const { error: err } = await sb.auth.signUp({ email, password });
    if (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase is not configured.');
    setError(null);
    const { error: err } = await sb.auth.signInWithPassword({ email, password });
    if (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const signOut = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    setError(null);
    await sb.auth.signOut();
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase is not configured.');
    setError(null);
    const { error: err } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/?type=recovery`,
    });
    if (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase is not configured.');
    setError(null);
    const { error: err } = await sb.auth.updateUser({ password });
    if (err) {
      setError(err.message);
      throw err;
    }
    setRecovery(false);
  }, []);

  const value: AuthContextValue = {
    configured,
    loading,
    session,
    user: session?.user ?? null,
    error,
    recovery,
    signUp,
    signIn,
    signOut,
    resetPassword,
    updatePassword,
    clearError: () => setError(null),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
