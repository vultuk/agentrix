import React, { useCallback, useEffect, useState } from 'react';
import LoginScreen from './features/auth/LoginScreen.js';
import RepoBrowser from './components/RepoBrowser.js';

const { createElement: h } = React;

export default function App() {
  const [authStatus, setAuthStatus] = useState('checking');
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

  if (authStatus === 'checking') {
    return h(
      'div',
      {
        className:
          'min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-400 font-sans text-sm'
      },
      'Checking authentication…'
    );
  }

  if (authStatus !== 'authenticated') {
    return h(LoginScreen, { onAuthenticated: handleAuthenticated });
  }

  return h(RepoBrowser, {
    onAuthExpired: handleAuthExpired,
    onLogout: handleLogout,
    isLoggingOut
  });
}
