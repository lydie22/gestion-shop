import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import React, { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { AccessibleShop, AuthSession, shopflowApi } from '@/services/shopflowApi';
import { flushPendingCashMovements } from '@/services/cashSyncQueue';
import { flushPendingSmsEvents } from '@/services/smsSyncQueue';
import { flushPendingTransactions } from '@/services/syncQueue';

const SESSION_KEY = 'shopflow.auth.session.v2';
const LEGACY_SESSION_KEY = 'shopflow.auth.session.v1';

interface AuthContextValue {
  session: AuthSession | null;
  accessibleShops: AccessibleShop[];
  isHydrating: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; full_name: string; shop_name: string; currency?: string }) => Promise<void>;
  logout: () => Promise<void>;
  switchShop: (shopId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [accessibleShops, setAccessibleShops] = useState<AccessibleShop[]>([]);
  const [isHydrating, setIsHydrating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<AuthSession | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    SecureStore.getItemAsync(SESSION_KEY)
      .then(async (raw) => {
        // One-time migration from the old plaintext AsyncStorage session.
        // Access and refresh tokens must never remain in general storage.
        let protectedRaw = raw;
        if (!protectedRaw) {
          const legacy = await AsyncStorage.getItem(LEGACY_SESSION_KEY);
          if (legacy) {
            await SecureStore.setItemAsync(SESSION_KEY, legacy);
            await AsyncStorage.removeItem(LEGACY_SESSION_KEY);
            protectedRaw = legacy;
          }
        }
        if (protectedRaw) setSession(JSON.parse(protectedRaw) as AuthSession);
      })
      .catch(() => setError('La session locale n’a pas pu être restaurée.'))
      .finally(() => setIsHydrating(false));
  }, []);

  // Renouvelle une session restaurée au lancement, puis périodiquement avant
  // l'expiration du jeton d'accès. En cas de coupure réseau, la session locale
  // reste disponible pour le mode hors ligne.
  useEffect(() => {
    if (isHydrating || !session?.refresh_token) return;
    let active = true;

    const renew = async () => {
      const current = sessionRef.current;
      if (!current?.refresh_token) return;
      try {
        const next = await shopflowApi.refresh(current.refresh_token);
        if (!active) return;
        await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(next));
        setSession(next);
      } catch {
        // Une coupure réseau ne déconnecte pas l'utilisateur localement.
        // La prochaine activation ou synchronisation réessaiera.
      }
    };

    void renew();
    const interval = setInterval(() => { void renew(); }, 20 * 60 * 1000);
    const appState = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void renew();
    });
    return () => {
      active = false;
      clearInterval(interval);
      appState.remove();
    };
  }, [isHydrating, session?.user_id]);

  useEffect(() => {
    if (!session?.access_token) {
      setAccessibleShops([]);
      return;
    }
    let active = true;
    shopflowApi.listMyShops(session.access_token)
      .then((shops) => { if (active) setAccessibleShops(shops); })
      .catch(() => { if (active) setAccessibleShops([]); });
    return () => { active = false; };
  }, [session?.access_token]);

  // Reprend les opérations locales après un redémarrage, au retour au premier
  // plan et périodiquement. Les endpoints serveur sont idempotents, donc une
  // coupure pendant l'envoi ne peut pas doubler un mouvement financier.
  useEffect(() => {
    if (isHydrating || !session?.access_token) return;
    let cancelled = false;
    let running = false;

    const flush = async () => {
      if (cancelled || running) return;
      running = true;
      try {
        await Promise.all([
          flushPendingTransactions(session.shop_id, session.access_token),
          flushPendingCashMovements(session.shop_id, session.access_token),
          flushPendingSmsEvents(session.shop_id, session.access_token),
        ]);
      } finally {
        running = false;
      }
    };

    void flush();
    const interval = setInterval(() => { void flush(); }, 30_000);
    const appState = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void flush();
    });
    return () => {
      cancelled = true;
      clearInterval(interval);
      appState.remove();
    };
  }, [isHydrating, session?.access_token, session?.shop_id]);

  const persist = useCallback(async (next: AuthSession) => {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(next));
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
    await SecureStore.deleteItemAsync(SESSION_KEY);
    await AsyncStorage.removeItem(LEGACY_SESSION_KEY);
    setSession(null);
    setAccessibleShops([]);
    setError(null);
  }, [session]);

  const switchShop = useCallback(async (shopId: string) => {
    if (!session || shopId === session.shop_id) return;
    try {
      await persist(await shopflowApi.switchShop(shopId, session.access_token));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Changement de boutique impossible.';
      setError(message);
      throw cause;
    }
  }, [persist, session]);

  const value = useMemo(() => ({ session, accessibleShops, isHydrating, error, login, register, logout, switchShop }), [session, accessibleShops, isHydrating, error, login, register, logout, switchShop]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth doit être utilisé dans AuthProvider.');
  return value;
}

