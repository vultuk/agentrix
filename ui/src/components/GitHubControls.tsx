import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Github, ChevronDown } from 'lucide-react';
import { ACTION_BUTTON_CLASS } from '../config/constants.js';

const { createElement: h } = React;

interface GitHubControlsProps {
  org: string;
  repo: string;
}

export default function GitHubControls({ org, repo }: GitHubControlsProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const toggleMenu = useCallback(() => {
    setIsMenuOpen((current) => !current);
  }, []);

  const closeMenu = useCallback(() => {
    setIsMenuOpen(false);
  }, []);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }
    const handleDocumentClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleDocumentClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isMenuOpen]);

  const repoUrl = `https://github.com/${org}/${repo}`;
  const menuItems = [
    { key: 'pulls', label: 'Pull Requests', href: `${repoUrl}/pulls` },
    { key: 'issues', label: 'Issues', href: `${repoUrl}/issues` },
    { key: 'actions', label: 'Actions', href: `${repoUrl}/actions` },
  ];

  return h(
    'div',
    {
      className: 'relative flex items-center gap-1',
      ref: menuRef,
    },
    h(
      'a',
      {
        href: repoUrl,
        target: '_blank',
        rel: 'noreferrer noopener',
        className: `${ACTION_BUTTON_CLASS} text-neutral-400 hover:text-neutral-100`,
        title: 'Open repository on GitHub',
      },
      h(Github, { size: 16 }),
    ),
    h(
      'button',
      {
        type: 'button',
        onClick: toggleMenu,
        className: `${ACTION_BUTTON_CLASS} text-neutral-400 hover:text-neutral-100`,
        'aria-haspopup': 'true',
        'aria-expanded': isMenuOpen ? 'true' : 'false',
        title: 'GitHub quick links',
      },
      h(ChevronDown, { size: 16 }),
    ),
    isMenuOpen
      ? h(
          'div',
          {
            className:
              'absolute right-0 top-full mt-2 w-44 rounded-md border border-neutral-800 bg-neutral-925 shadow-lg z-30 py-1',
          },
          menuItems.map((item) =>
            h(
              'a',
              {
                key: item.key,
                href: item.href,
                target: '_blank',
                rel: 'noreferrer noopener',
                className:
                  'block px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800 transition-colors',
                onClick: closeMenu,
              },
              item.label,
            ),
          ),
        )
      : null,
  );
}

