import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getMe, logout as apiLogout } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount: validate the stored token with the server
  useEffect(() => {
    const token = localStorage.getItem('ll_token');
    if (!token) {
      setLoading(false);
      return;
    }
    getMe()
      .then((data) => setUser(data.user))
      .catch(() => {
        // Token expired or invalid — clear it
        localStorage.removeItem('ll_token');
        localStorage.removeItem('ll_user');
      })
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback((userData) => {
    setUser(userData);
  }, []);

  const signOut = useCallback(() => {
    apiLogout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
