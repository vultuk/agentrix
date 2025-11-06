import React, { Fragment } from 'react';
import { Resizable } from 're-resizable';
import RepositorySidebar from './RepositorySidebar.js';
import type { Worktree, RepoDashboard } from '../../../types/domain.js';

const { createElement: h } = React;

interface SidebarProps {
  // Desktop sidebar
  width: number;
  onWidthChange: (width: number) => void;
  
  // Mobile sidebar
  isMobileMenuOpen: boolean;
  onCloseMobileMenu: () => void;
  
  // Content props
  data: any;
  collapsedOrganisations: Record<string, boolean>;
  toggleOrganisationCollapsed: (org: string) => void;
  openPromptModalForRepo: (org: string, repo: string) => void;
  openWorktreeModalForRepo: (org: string, repo: string) => void;
  openRepoSettings: (org: string, repo: string, initCommandValue?: string) => void;
  handleWorktreeSelection: (org: string, repo: string, branch: string) => Promise<void>;
  activeWorktree: Worktree | null;
  activeRepoDashboard: RepoDashboard | null;
  sessionMetadataSnapshot: Map<string, any>;
  idleAcknowledgementsSnapshot: Map<string, any>;
  isIdleAcknowledgementCurrent: (key: string, metadata: any, acknowledgements: Map<string, any>) => boolean;
  onConfirmDelete: (org: string, repo: string, branch: string) => void;
  onAcknowledgeIdle: (org: string, repo: string, branch: string) => void;
  onShowRepoDashboard: (org: string, repo: string) => void;
  onAddRepository: () => void;
  logoutButton: React.ReactNode;
}

export default function Sidebar({
  width,
  onWidthChange,
  isMobileMenuOpen,
  onCloseMobileMenu,
  data,
  collapsedOrganisations,
  toggleOrganisationCollapsed,
  openPromptModalForRepo,
  openWorktreeModalForRepo,
  openRepoSettings,
  handleWorktreeSelection,
  activeWorktree,
  activeRepoDashboard,
  sessionMetadataSnapshot,
  idleAcknowledgementsSnapshot,
  isIdleAcknowledgementCurrent,
  onConfirmDelete,
  onAcknowledgeIdle,
  onShowRepoDashboard,
  onAddRepository,
  logoutButton,
}: SidebarProps) {
  const sidebarContent = h(RepositorySidebar, {
    data,
    collapsedOrganisations,
    toggleOrganisationCollapsed,
    openPromptModalForRepo,
    openWorktreeModalForRepo,
    openRepoSettings,
    handleWorktreeSelection,
    activeWorktree,
    activeRepoDashboard,
    sessionMetadataSnapshot,
    idleAcknowledgementsSnapshot,
    isIdleAcknowledgementCurrent,
    onConfirmDelete,
    onAcknowledgeIdle,
    onShowRepoDashboard,
    onAddRepository,
    onCloseMobileMenu,
    logoutButton,
  });

  const desktopSidebar = h(
    // @ts-ignore - Resizable type definition issue with grid defaultProps
    Resizable,
    {
      size: { width, height: '100%' },
      onResizeStop: (_event: any, _direction: any, _ref: any, delta: any) => onWidthChange(width + delta.width),
      minWidth: 260,
      maxWidth: 540,
      className: 'border-r border-neutral-800 bg-neutral-925 relative hidden lg:block'
    },
    sidebarContent
  );

  const mobileSidebar = h(
    'div',
    {
      className: `lg:hidden fixed inset-0 z-40 bg-neutral-950/95 backdrop-blur-md transition-transform duration-150 ease-out ${
        isMobileMenuOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 pointer-events-none'
      }`,
      onPointerDown: (event) => {
        if (event.target === event.currentTarget) {
          onCloseMobileMenu();
        }
      }
    },
    h(
      'div',
      {
        className: 'h-full w-[88vw] max-w-sm border-r border-neutral-800 bg-neutral-925 relative',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': 'Repository navigation'
      },
      sidebarContent
    )
  );

  return h(
    Fragment,
    null,
    desktopSidebar,
    mobileSidebar
  );
}
