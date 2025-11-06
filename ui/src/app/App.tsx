import React from 'react';
import { AuthProvider, useAuth } from '../context/AuthContext.js';
import { ThemeProvider } from '../context/ThemeContext.js';
import LoginScreen from '../features/auth/components/LoginScreen.js';
import RepoBrowser from '../features/repositories/components/RepoBrowser.js';

const { createElement: h } = React;

function AppContent() {
  const { authStatus, handleAuthenticated, handleAuthExpired, handleLogout, isLoggingOut } = useAuth();

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

export default function App() {
  return h(ThemeProvider, null, h(AuthProvider, null, h(AppContent)));
}
