import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const { createElement: h } = React;

type ThemeMode = 'dark' | 'light';

interface ThemeContextValue {
  mode: ThemeMode;
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'agentrix:theme';

function resolveInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'dark';
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', stored);
        document.documentElement.style.colorScheme = stored === 'light' ? 'light' : 'dark';
      }
      return stored;
    }
  } catch {
    // Ignore storage read errors.
  }
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const fallback = prefersDark ? 'dark' : 'light';
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', fallback);
    document.documentElement.style.colorScheme = fallback === 'light' ? 'light' : 'dark';
  }
  return fallback;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const storedPreference =
    typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
  const hasExplicitPreferenceRef = useRef<boolean>(
    storedPreference === 'light' || storedPreference === 'dark',
  );
  const [mode, setModeState] = useState<ThemeMode>(() => resolveInitialTheme());

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    document.documentElement.setAttribute('data-theme', mode);
    document.documentElement.style.colorScheme = mode === 'light' ? 'light' : 'dark';
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Ignore storage write errors (private browsing, etc.)
    }
  }, [mode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const listener = (event: MediaQueryListEvent) => {
      if (hasExplicitPreferenceRef.current) {
        return;
      }
      setModeState(event.matches ? 'dark' : 'light');
    };
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', listener);
    } else if (typeof query.addListener === 'function') {
      query.addListener(listener);
    }
    return () => {
      if (typeof query.removeEventListener === 'function') {
        query.removeEventListener('change', listener);
      } else if (typeof query.removeListener === 'function') {
        query.removeListener(listener);
      }
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    hasExplicitPreferenceRef.current = true;
    setModeState((current) => (current === next ? current : next));
  }, []);

  const toggle = useCallback(() => {
    hasExplicitPreferenceRef.current = true;
    setModeState((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo(
    () => ({
      mode,
      toggle,
      setMode,
    }),
    [mode, toggle, setMode],
  );

  return h(ThemeContext.Provider, { value }, children);
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
