import { useState, useCallback, useRef } from 'react';
import { ORGANISATION_COLLAPSE_STORAGE_KEY } from '../config/constants.js';

export function useUIState() {
  const [width, setWidth] = useState(340);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);
  const [isTaskMenuOpen, setIsTaskMenuOpen] = useState(false);
  
  const [collapsedOrganisations, setCollapsedOrganisations] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') {
      return {};
    }
    try {
      const stored = window.localStorage.getItem(ORGANISATION_COLLAPSE_STORAGE_KEY);
      if (!stored) {
        return {};
      }
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return Object.fromEntries(
          Object.entries(parsed).map(([key, value]) => [key, Boolean(value)])
        );
      }
    } catch (error) {
      console.warn('Failed to restore organisation collapse state', error);
    }
    return {};
  });

  const [gitSidebarState, setGitSidebarState] = useState<Record<string, any>>({});
  const [activeRepoDashboard, setActiveRepoDashboard] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);

  const taskMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const dashboardCacheRef = useRef(new Map());
  const dashboardPollingRef = useRef<{ timerId: any; controller: any }>({ timerId: null, controller: null });

  const registerMobileMenuButton = useCallback((node: HTMLButtonElement | null) => {
    mobileMenuButtonRef.current = node;
  }, []);

  const toggleOrganisation = useCallback((org: string) => {
    setCollapsedOrganisations(prev => {
      const next = { ...prev, [org]: !prev[org] };
      try {
        window.localStorage.setItem(ORGANISATION_COLLAPSE_STORAGE_KEY, JSON.stringify(next));
      } catch (error) {
        console.warn('Failed to persist organisation collapse state', error);
      }
      return next;
    });
  }, []);

  const closeMobileMenu = useCallback(() => setIsMobileMenuOpen(false), []);
  const openMobileMenu = useCallback(() => setIsMobileMenuOpen(true), []);

  const closeAllMenus = useCallback(() => {
    setIsMobileMenuOpen(false);
    setOpenActionMenu(null);
    setIsTaskMenuOpen(false);
  }, []);

  return {
    // Sidebar
    width,
    setWidth,
    
    // Mobile
    isMobileMenuOpen,
    setIsMobileMenuOpen,
    closeMobileMenu,
    openMobileMenu,
    mobileMenuButtonRef,
    registerMobileMenuButton,
    
    // Menus
    openActionMenu,
    setOpenActionMenu,
    isTaskMenuOpen,
    setIsTaskMenuOpen,
    closeAllMenus,
    taskMenuRef,
    
    // Organisation collapse
    collapsedOrganisations,
    setCollapsedOrganisations,
    toggleOrganisation,
    
    // Git sidebar
    gitSidebarState,
    setGitSidebarState,
    
    // Dashboard
    activeRepoDashboard,
    setActiveRepoDashboard,
    dashboardData,
    setDashboardData,
    dashboardError,
    setDashboardError,
    isDashboardLoading,
    setIsDashboardLoading,
    dashboardCacheRef,
    dashboardPollingRef,
  };
}

