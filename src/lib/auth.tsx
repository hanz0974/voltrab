import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string, captchaToken?: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  isEmailRegistered: (email: string) => Promise<boolean | null>;
  sendSignUpCode: (email: string, captchaToken?: string) => Promise<{ error: string | null }>;
  verifySignUpCode: (email: string, token: string, password: string) => Promise<{ error: string | null }>;
  sendPasswordResetCode: (email: string, captchaToken?: string) => Promise<{ error: string | null }>;
  resetPasswordWithCode: (email: string, token: string, password: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Initialize session from storage
    const initializeSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const currentUser = data.session?.user ?? null;
        setSession(data.session);
        setUser(currentUser);
        
        // Validate and refresh token if needed (< 5 minutes left)
        if (data.session?.expires_in && data.session.expires_in < 300) {
          await supabase.auth.refreshSession();
        }
      } catch (error) {
        console.error('Error initializing session:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeSession();

    // Listen to auth state changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      const currentUser = newSession?.user ?? null;
      setSession(newSession);
      setUser(currentUser);
      setLoading(false);

    });

    return () => listener?.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;

    if (!user) {
      setIsAdmin(false);
      return () => {
        active = false;
      };
    }

    const loadAdminRole = async () => {
      const { data, error } = await supabase.rpc('is_admin_actor');
      if (active) {
        setIsAdmin(!error && data === true);
      }
    };

    void loadAdminRole();

    return () => {
      active = false;
    };
  }, [user]);

  const signIn = useCallback(async (email: string, password: string, captchaToken?: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken },
    });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const isEmailRegistered = useCallback(async (email: string) => {
    const { data, error } = await supabase.rpc('email_is_registered', { check_email: email });
    if (error) return null;
    return data === true;
  }, []);

  const sendSignUpCode = useCallback(async (email: string, captchaToken?: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, captchaToken },
    });
    return { error: error?.message ?? null };
  }, []);

  const verifySignUpCode = useCallback(async (email: string, token: string, password: string) => {
    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (verifyError) return { error: verifyError.message };
    const { error: passwordError } = await supabase.auth.updateUser({ password });
    return { error: passwordError?.message ?? null };
  }, []);

  // Lupa password: Supabase mengirim kode 6 digit lewat template email "Reset Password".
  // Untuk email yang tidak terdaftar, Supabase tetap mengembalikan sukses tanpa mengirim email.
  const sendPasswordResetCode = useCallback(async (email: string, captchaToken?: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { captchaToken });
    return { error: error?.message ?? null };
  }, []);

  const resetPasswordWithCode = useCallback(async (email: string, token: string, password: string) => {
    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' });
    if (verifyError) return { error: verifyError.message };
    const { error: passwordError } = await supabase.auth.updateUser({ password });
    return { error: passwordError?.message ?? null };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const redirectTo = new URL('/', window.location.href).toString();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    // Force local logout without hitting Auth API endpoint to avoid
    // intermittent 403/AuthSessionMissing during token-expired states.
    if (typeof window !== 'undefined') {
      const authKeys = Object.keys(window.localStorage).filter((key) =>
        key.startsWith('sb-') && key.includes('auth-token'),
      );
      authKeys.forEach((key) => window.localStorage.removeItem(key));
    }

    setSession(null);
    setUser(null);
    setIsAdmin(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, isAdmin, signIn, signUp, isEmailRegistered, sendSignUpCode, verifySignUpCode, sendPasswordResetCode, resetPasswordWithCode, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
