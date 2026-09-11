import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, getToken, setToken, type PublicUser } from './api';

type AuthContextValue = {
  user: PublicUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, nickname: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  // При старте — если есть токен, тянем /me
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api.get<{ user: PublicUser }>('/api/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

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
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (k.startsWith('egv.') && k !== 'egv.token') localStorage.removeItem(k);
      }
    } catch {}
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth должен быть внутри <AuthProvider>');
  return ctx;
}
