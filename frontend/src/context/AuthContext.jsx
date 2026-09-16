/* ============================================
   CID Aprueba — Auth state
   ============================================ */
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as API from '../api.js';
import { useToast } from './ToastContext.jsx';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'authed' | 'anon'
  const { showToast } = useToast();

  useEffect(() => {
    const token = API.getToken();
    if (!token) {
      setStatus('anon');
      return;
    }
    API.getMe()
      .then((result) => {
        setUser(result.data.user);
        setStatus('authed');
      })
      .catch(() => {
        API.removeToken();
        setStatus('anon');
      });
  }, []);

  useEffect(() => {
    const onExpired = () => {
      setUser((current) => {
        if (!current) return current; // not logged in (e.g. a failed login) — nothing to expire
        showToast('Sesión expirada', 'warning');
        return null;
      });
      setStatus((current) => (current === 'authed' ? 'anon' : current));
    };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, [showToast]);

  const login = useCallback(async (username, password) => {
    const result = await API.login(username, password);
    setUser(result.data.user);
    setStatus('authed');
    return result;
  }, []);

  const logout = useCallback(() => {
    API.removeToken();
    setUser(null);
    setStatus('anon');
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, status, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
