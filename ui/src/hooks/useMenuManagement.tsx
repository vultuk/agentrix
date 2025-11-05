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

  const closeMobileMenu = useCallback(() => {
    flushSync(() => {
      setIsMobileMenuOpen(false);
    });
    if (mobileMenuButtonRef.current) {
      mobileMenuButtonRef.current.focus();
    }
  }, [mobileMenuButtonRef]);


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


  return {
    isMobileMenuOpen,
    setIsMobileMenuOpen,
    closeMobileMenu,
  };
}

