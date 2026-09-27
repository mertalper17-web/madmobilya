import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const AuthCtx = createContext(null);

// axios global config
axios.defaults.withCredentials = true;
axios.interceptors.request.use(cfg => {
  const t = localStorage.getItem('mad_token');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading

  const fetchMe = useCallback(async () => {
    const t = localStorage.getItem('mad_token');
    if (!t) { setUser(null); return; }
    try {
      const { data } = await axios.get(`${API}/auth/me`);
      setUser(data);
    } catch { localStorage.removeItem('mad_token'); setUser(null); }
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  const login = async (username, password) => {
    const { data } = await axios.post(`${API}/auth/login`, { username, password });
    localStorage.setItem('mad_token', data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try { await axios.post(`${API}/auth/logout`); } catch {}
    localStorage.removeItem('mad_token');
    setUser(null);
  };

  return <AuthCtx.Provider value={{ user, login, logout, refresh: fetchMe }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

// role-based access map
export const ROLE_ACCESS = {
  admin:     ['dashboard', 'configurator', 'products', 'materials', 'customers', 'orders', 'sales', 'expenses', 'discounts', 'users'],
  muhasebe:  ['dashboard', 'products', 'materials', 'customers', 'orders', 'sales', 'expenses', 'discounts'],
  depo:      ['dashboard', 'materials', 'products', 'orders'],
  sevkiyat:  ['dashboard', 'orders', 'customers'],
  montaj:    ['dashboard', 'orders'],
};

export const canAccess = (user, key) => user && ROLE_ACCESS[user.role]?.includes(key);
