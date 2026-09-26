import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError, getToken, setToken, type PublicUser } from './api';
import { localStore, sessionStore } from './storage';

type AuthContextValue = {
  user: PublicUser | null;
  loading: boolean;
  loadError: boolean;
  retry: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, nickname: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const qc = useQueryClient();

  // При старте — если есть токен, тянем /me
  useEffect(() => {
    let active = true;
    setLoadError(false);
    setLoading(true);
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api.get<{ user: PublicUser }>('/api/auth/me')
      .then((r) => { if (active) setUser(r.user); })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) setToken(null);
        else setLoadError(true);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  useEffect(() => {
    const expired = () => { setToken(null); setUser(null); qc.clear(); };
    window.addEventListener('egv:session-expired', expired);
    return () => window.removeEventListener('egv:session-expired', expired);
  }, [qc]);

  const login = async (email: string, password: string) => {
    const r = await api.post<{ token: string; user: PublicUser }>('/api/auth/login', { email, password });
    setToken(r.token);
    setUser(r.user);
  };

  const register = async (email: string, password: string, nickname: string) => {
    const r = await api.post<{ token: string; user: PublicUser }>('/api/auth/register', { email, password, nickname });
    setToken(r.token);
    setUser(r.user);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    // Полная чистка: react-query кэш + локальные ключи EG Voice.
    // Так следующий вход не покажет чужие данные.
    qc.clear();
    try {
      const keys = localStore.keys();
      for (const k of keys) {
        if (k.startsWith('egv.') && k !== 'egv.token' && k !== 'egv.voice.v1') localStore.removeItem(k);
      }
      for (const k of sessionStore.keys()) if (k.startsWith('egv.draft.')) sessionStore.removeItem(k);
    } catch {}
  };

  return (
    <AuthContext.Provider value={{ user, loading, loadError, retry: () => setAttempt(a => a + 1), login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth должен быть внутри <AuthProvider>');
  return ctx;
}
