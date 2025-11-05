import React, { createContext, useContext, ReactNode } from 'react';
import { useModals } from '../hooks/useModals.js';
import { useTerminalState } from '../hooks/useTerminalState.js';
import { useFormState } from '../hooks/useFormState.js';
import { useUIState } from '../hooks/useUIState.js';
import { useLoadingState } from '../hooks/useLoadingState.js';

const { createElement: h } = React;

interface AppContextValue {
  modals: ReturnType<typeof useModals>;
  terminal: ReturnType<typeof useTerminalState>;
  forms: ReturnType<typeof useFormState>;
  ui: ReturnType<typeof useUIState>;
  loading: ReturnType<typeof useLoadingState>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppContextProvider({ children }: { children: ReactNode }) {
  const modals = useModals();
  const terminal = useTerminalState();
  const forms = useFormState();
  const ui = useUIState();
  const loading = useLoadingState();

  const value: AppContextValue = {
    modals,
    terminal,
    forms,
    ui,
    loading,
  };

  return h(AppContext.Provider, { value }, children);
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppContextProvider');
  }
  return context;
}
