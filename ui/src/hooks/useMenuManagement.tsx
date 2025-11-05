/**
 * Hook for managing various menu states and interactions
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { flushSync } from 'react-dom';

interface UseMenuManagementOptions {
  mobileMenuButtonRef: MutableRefObject<HTMLButtonElement | null>;
}

type ActionMenuRegistry = Record<string, HTMLDivElement | null>;

export function useMenuManagement({ mobileMenuButtonRef }: UseMenuManagementOptions) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);
  const actionMenuRefs = useRef<ActionMenuRegistry>({});

  const closeMobileMenu = useCallback(() => {
    flushSync(() => {
      setIsMobileMenuOpen(false);
    });
    if (mobileMenuButtonRef.current) {
      mobileMenuButtonRef.current.focus();
    }
  }, [mobileMenuButtonRef]);

  const toggleActionMenu = useCallback((key: string) => {
    setOpenActionMenu((current) => (current === key ? null : key));
  }, []);

  const closeActionMenu = useCallback(() => {
    setOpenActionMenu(null);
  }, []);

  const getActionMenuRef = useCallback(
    (key: string) => (node: HTMLDivElement | null) => {
      if (node) {
        actionMenuRefs.current[key] = node;
      } else {
        delete actionMenuRefs.current[key];
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

  // Close open action menus on outside click or escape
  useEffect(() => {
    if (!openActionMenu) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      const menuNode = actionMenuRefs.current[openActionMenu] || null;
      if (menuNode && target instanceof Node && menuNode.contains(target)) {
        return;
      }
      closeActionMenu();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeActionMenu();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openActionMenu, closeActionMenu]);

  return {
    isMobileMenuOpen,
    setIsMobileMenuOpen,
    closeMobileMenu,
    openActionMenu,
    toggleActionMenu,
    getActionMenuRef,
  };
}
