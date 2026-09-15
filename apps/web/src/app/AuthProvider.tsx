import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { PermissionKey } from '@servicedesk/shared';
import { apiClient, getAccessToken, setTokens } from '../lib/apiClient';

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: PermissionKey[];
  projectAccess: { projectId: string; accessLevel: 'FULL' | 'READ_ONLY' }[];
  canViewAllProjects: boolean;
}

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hasPermission: (...keys: PermissionKey[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    apiClient
      .get('/auth/me')
      .then((res) => setUser(res.data))
      .catch(() => setTokens(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const res = await apiClient.post('/auth/login', { email, password });
    setTokens({ accessToken: res.data.accessToken, refreshToken: res.data.refreshToken });
    setUser(res.data.user);
  };

  const logout = () => {
    setTokens(null);
    setUser(null);
  };

  const hasPermission = (...keys: PermissionKey[]) => !!user && keys.some((k) => user.permissions.includes(k));

  return <AuthContext.Provider value={{ user, loading, login, logout, hasPermission }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
