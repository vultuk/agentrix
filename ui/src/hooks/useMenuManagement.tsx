/**
 * Hook for managing various menu states and interactions
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

interface UseMenuManagementOptions {
  mobileMenuButtonRef: React.MutableRefObject<HTMLButtonElement | null>;
}

export function useMenuManagement({ mobileMenuButtonRef }: UseMenuManagementOptions) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isTaskMenuOpen, setIsTaskMenuOpen] = useState(false);
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);
  const taskMenuRef = useRef<HTMLDivElement | null>(null);
  const actionMenuRefs = useRef(new Map<string, HTMLDivElement>());

  const closeMobileMenu = useCallback(() => {
    flushSync(() => {
      setIsMobileMenuOpen(false);
    });
    if (mobileMenuButtonRef.current) {
      mobileMenuButtonRef.current.focus();
    }
  }, [mobileMenuButtonRef]);

  const toggleTaskMenu = useCallback(() => {
    setIsTaskMenuOpen((current) => !current);
  }, []);

  const closeTaskMenu = useCallback(() => {
    setIsTaskMenuOpen(false);
  }, []);

  const toggleActionMenu = useCallback((action: string) => {
    setOpenActionMenu((current) => (current === action ? null : action));
  }, []);

  const getActionMenuRef = useCallback(
    (action: string) => (node: HTMLDivElement | null) => {
      if (node) {
        actionMenuRefs.current.set(action, node);
      } else {
        actionMenuRefs.current.delete(action);
      }
    },
    []
  );

  // Mobile menu escape key handler
  useEffect(() => {
    if (!isMobileMenuOpen) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMobileMenu();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobileMenuOpen, closeMobileMenu]);

  // Task menu click-outside and escape handler
  useEffect(() => {
    if (!isTaskMenuOpen) {
      return undefined;
    }
    const handlePointer = (event: MouseEvent) => {
      if (taskMenuRef.current && !taskMenuRef.current.contains(event.target as Node)) {
        closeTaskMenu();
      }
    };
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeTaskMenu();
      }
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKeydown);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [isTaskMenuOpen, closeTaskMenu]);

  // Action menu click-outside and escape handler
  useEffect(() => {
    if (!openActionMenu) {
      return;
    }
    const handleDocumentClick = (event: MouseEvent) => {
      const menuNode = actionMenuRefs.current.get(openActionMenu);
      if (menuNode && !menuNode.contains(event.target as Node)) {
        setOpenActionMenu(null);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenActionMenu(null);
      }
    };
    document.addEventListener('mousedown', handleDocumentClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openActionMenu]);

  // Close action menu when pending worktree action is cleared
  const clearActionMenuOnPendingClear = useCallback((pendingWorktreeAction: any) => {
    if (!pendingWorktreeAction) {
      setOpenActionMenu(null);
    }
  }, []);

  return {
    isMobileMenuOpen,
    setIsMobileMenuOpen,
    isTaskMenuOpen,
    setIsTaskMenuOpen,
    openActionMenu,
    setOpenActionMenu,
    taskMenuRef,
    closeMobileMenu,
    toggleTaskMenu,
    closeTaskMenu,
    toggleActionMenu,
    getActionMenuRef,
    clearActionMenuOnPendingClear,
  };
}

