import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthSession, shopflowApi } from '@/services/shopflowApi';

const SESSION_KEY = 'shopflow.auth.session.v1';

interface AuthContextValue {
  session: AuthSession | null;
  isHydrating: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; full_name: string; shop_name: string; currency?: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(SESSION_KEY)
      .then((raw) => {
        if (raw) setSession(JSON.parse(raw) as AuthSession);
      })
      .catch(() => setError('La session locale n’a pas pu être restaurée.'))
      .finally(() => setIsHydrating(false));
  }, []);

  // Renouvelle une session restaurée au lancement. En cas de coupure réseau,
  // la session locale reste disponible pour le mode hors ligne.
  useEffect(() => {
    if (isHydrating || !session?.refresh_token) return;
    let active = true;
    shopflowApi.refresh(session.refresh_token)
      .then(async (next) => {
        if (!active) return;
        await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next));
        setSession(next);
      })
      .catch(() => {
        // Le backend sera rejoint lors de la prochaine synchronisation réseau.
      });
    return () => { active = false; };
  }, [isHydrating]);

  const persist = useCallback(async (next: AuthSession) => {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next));
    setSession(next);
    setError(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      await persist(await shopflowApi.login(email.trim(), password));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Connexion impossible.';
      setError(message);
      throw cause;
    }
  }, [persist]);

  const register = useCallback(async (input: { email: string; password: string; full_name: string; shop_name: string; currency?: string }) => {
    try {
      await persist(await shopflowApi.register(input));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Inscription impossible.';
      setError(message);
      throw cause;
    }
  }, [persist]);

  const logout = useCallback(async () => {
    if (session?.refresh_token) {
      try {
        await shopflowApi.logout(session.refresh_token);
      } catch {
        // La révocation serveur peut être réessayée ; la session locale est supprimée immédiatement.
      }
    }
    await AsyncStorage.removeItem(SESSION_KEY);
    setSession(null);
    setError(null);
  }, [session]);

  const value = useMemo(() => ({ session, isHydrating, error, login, register, logout }), [session, isHydrating, error, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth doit être utilisé dans AuthProvider.');
  return value;
}

