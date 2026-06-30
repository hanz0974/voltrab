import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initialize session from storage
    const initializeSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setSession(data.session);
        setUser(data.session?.user ?? null);
        
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
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);

    });

    return () => listener?.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    try {
      // Check if there's an active session before attempting logout
      const { data: { session: activeSession } } = await supabase.auth.getSession();
      
      if (!activeSession) {
        // Session already cleared, just update local state
        setSession(null);
        setUser(null);
        return;
      }

      const { error } = await supabase.auth.signOut();
      
      // 403 Forbidden on logout is often a token expiry issue - ignore it
      // The local session is still cleared, which is what matters
      if (error && error.status !== 403) {
        console.error('Logout error:', error);
      }
    } catch (error) {
      console.error('Error during sign out:', error);
      // Always clear local state even if logout fails
      setSession(null);
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
