import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '../services/apiConfig.js';
import {
  getAuthenticatedUser,
  getCsrfToken,
  loginAccount,
  logoutAccount,
  signupAccount,
} from '../services/authService.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(API_BASE_URL));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!API_BASE_URL) return undefined;

    let cancelled = false;
    getAuthenticatedUser()
      .then((result) => {
        if (!cancelled) setUser(result.user);
      })
      .catch((requestError) => {
        if (cancelled) return;
        if (requestError.status !== 401) setError(requestError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const signup = useCallback(async (account) => {
    setError('');
    const { csrfToken } = await getCsrfToken();
    return signupAccount(account, csrfToken);
  }, []);

  const login = useCallback(async (credentials) => {
    setError('');
    const { csrfToken } = await getCsrfToken();
    const result = await loginAccount(credentials, csrfToken);
    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    setError('');
    try {
      const { csrfToken } = await getCsrfToken();
      await logoutAccount(csrfToken);
      setUser(null);
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    }
  }, []);

  const clearError = useCallback(() => setError(''), []);
  const value = useMemo(() => ({
    user,
    isAuthenticated: Boolean(user),
    loading,
    error,
    clearError,
    signup,
    login,
    logout,
  }), [user, loading, error, clearError, signup, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider.');
  return context;
}
