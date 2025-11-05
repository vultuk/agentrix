import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

const { createElement: h } = React;

type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  authStatus: AuthStatus;
  isLoggingOut: boolean;
  checkAuthStatus: () => Promise<void>;
  handleAuthenticated: () => void;
  handleAuthExpired: () => void;
  handleLogout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const checkAuthStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/status', { credentials: 'include' });
      if (!response.ok) {
        setAuthStatus('unauthenticated');
        return;
      }
      const body = await response.json();
      setAuthStatus(body && body.authenticated ? 'authenticated' : 'unauthenticated');
    } catch (error) {
      setAuthStatus('unauthenticated');
    }
  }, []);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  const handleAuthenticated = useCallback(() => {
    setAuthStatus('authenticated');
    checkAuthStatus();
  }, [checkAuthStatus]);

  const handleAuthExpired = useCallback(() => {
    setIsLoggingOut(false);
    setAuthStatus('unauthenticated');
  }, []);

  const handleLogout = useCallback(async () => {
    if (isLoggingOut) {
      return;
    }
    setIsLoggingOut(true);
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
    } catch {
    } finally {
      setIsLoggingOut(false);
      setAuthStatus('unauthenticated');
    }
  }, [isLoggingOut]);

  const value: AuthContextValue = {
    authStatus,
    isLoggingOut,
    checkAuthStatus,
    handleAuthenticated,
    handleAuthExpired,
    handleLogout,
  };

  return h(AuthContext.Provider, { value }, children);
}

