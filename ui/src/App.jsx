import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Resizable } from 're-resizable';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import {
  ChevronDown,
  Github,
  GitBranch,
  GitPullRequest,
  Menu,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

import 'xterm/css/xterm.css';
import { renderMarkdown } from './utils/markdown';

const { createElement: h } = React;

const DEFAULT_COMMAND_CONFIG = Object.freeze({
  codex: 'codex',
  codexDangerous: 'codex --dangerously-bypass-approvals-and-sandbox',
  claude: 'claude',
  claudeDangerous: 'claude --dangerously-skip-permissions',
  cursor: 'cursor-agent',
  vscode: 'code .'
});

const WORKTREE_LAUNCH_OPTIONS = Object.freeze([
  { value: 'terminal', label: 'Terminal' },
  { value: 'vscode', label: 'VS Code' },
  { value: 'codex', label: 'Codex' },
  { value: 'claude', label: 'Claude' },
  { value: 'cursor', label: 'Cursor' }
]);

const PROMPT_AGENT_OPTIONS = Object.freeze([
  { value: 'codex', label: 'Codex' },
  { value: 'claude', label: 'Claude' },
  { value: 'cursor', label: 'Cursor' }
]);

const PROMPT_EDITOR_TABS = Object.freeze([
  { value: 'edit', label: 'Edit' },
  { value: 'preview', label: 'Preview' }
]);

const REPOSITORY_POLL_INTERVAL_MS = 5000;

const ORGANISATION_COLLAPSE_STORAGE_KEY = 'terminal-worktree:collapsed-organisations';

function Modal({ title, onClose, children, size = 'md', position = 'center' }) {
        const content = Array.isArray(children) ? children : [children];
        const alignmentClass = position === 'top' ? 'items-start' : 'items-center';
        const wrapperSpacingClass = position === 'top' ? 'mt-10' : '';
        const maxWidthClass = size === 'lg' ? 'max-w-3xl' : 'max-w-md';
        return h(
          'div',
          {
            className: [
              'fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center z-50 p-4',
              alignmentClass
            ]
              .filter(Boolean)
              .join(' '),
            onClick: onClose
          },
          h(
            'div',
            {
              className: [
                'bg-neutral-900 border border-neutral-700 rounded-lg w-full shadow-xl',
                maxWidthClass,
                wrapperSpacingClass
              ]
                .filter(Boolean)
                .join(' '),
              onClick: event => event.stopPropagation()
            },
            h(
              'div',
              { className: 'flex items-center justify-between px-4 py-3 border-b border-neutral-800' },
              h('h2', { className: 'text-sm font-semibold text-neutral-100' }, title),
              h(
                'button',
                {
                  type: 'button',
                  onClick: onClose,
                  className: 'text-neutral-500 hover:text-neutral-200 transition-colors'
                },
                h(X, { size: 16 })
              )
            ),
            h('div', { className: 'px-4 py-4 space-y-3' }, ...content)
          )
        );
      }

function LoginScreen({ onAuthenticated }) {
        const [password, setPassword] = useState('');
        const [error, setError] = useState(null);
        const [isSubmitting, setIsSubmitting] = useState(false);
        const inputRef = useRef(null);

        useEffect(() => {
          if (inputRef.current) {
            inputRef.current.focus();
          }
        }, []);

        const handleSubmit = useCallback(
          async (event) => {
            event.preventDefault();
            if (isSubmitting) {
              return;
            }
            const trimmed = password.trim();
            if (!trimmed) {
              setError('Password is required.');
              return;
            }
            setIsSubmitting(true);
            setError(null);
            try {
              const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ password: trimmed })
              });
              if (response.ok) {
                setPassword('');
                if (typeof onAuthenticated === 'function') {
                  onAuthenticated();
                }
                return;
              }
              if (response.status === 401) {
                setError('Incorrect password. Try again.');
                return;
              }
              let message = 'Login failed. Please try again.';
              try {
                const data = await response.json();
                if (data && typeof data.error === 'string') {
                  message = data.error;
                }
              } catch {}
              setError(message);
            } catch {
              setError('Unable to reach the server. Ensure terminal-worktree is running.');
            } finally {
              setIsSubmitting(false);
            }
          },
          [isSubmitting, password, onAuthenticated]
        );

        return h(
          'div',
          {
            className:
              'min-h-screen bg-neutral-950 flex items-center justify-center px-4 text-neutral-100'
          },
          h(
            'div',
            {
              className:
                'w-full max-w-sm space-y-6 rounded-lg border border-neutral-800 bg-neutral-900/90 p-6 shadow-xl'
            },
            h(
              'div',
              { className: 'space-y-1' },
              h('h1', { className: 'text-lg font-semibold text-neutral-50' }, 'terminal-worktree'),
              h(
                'p',
                { className: 'text-sm text-neutral-400' },
                'Enter the password printed by the CLI to continue.'
              )
            ),
            h(
              'form',
              {
                className: 'space-y-4',
                onSubmit: handleSubmit
              },
              h(
                'div',
                { className: 'space-y-2' },
                h(
                  'label',
                  { className: 'block text-xs uppercase tracking-wide text-neutral-400' },
                  'Password'
                ),
                h('input', {
                  ref: inputRef,
                  type: 'password',
                  value: password,
                  onChange: (event) => {
                    setPassword(event.target.value);
                    if (error) {
                      setError(null);
                    }
                  },
                  autoComplete: 'current-password',
                  placeholder: 'Paste password here',
                  className:
                    'w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-500/60'
                })
              ),
              error ? h('p', { className: 'text-xs text-rose-300' }, error) : null,
              h(
                'button',
                {
                  type: 'submit',
                  disabled: isSubmitting,
                  className:
                    'w-full inline-flex items-center justify-center gap-2 rounded-md bg-emerald-500/80 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-65'
                },
                isSubmitting ? 'Logging in…' : 'Log in'
              )
            )
          )
        );
      }

      function RepoBrowser({ onAuthExpired, onLogout, isLoggingOut } = {}) {
        const [width, setWidth] = useState(340);
        const [data, setData] = useState({});
        const [showAddRepoModal, setShowAddRepoModal] = useState(false);
        const [repoUrl, setRepoUrl] = useState('');
        const [showWorktreeModal, setShowWorktreeModal] = useState(false);
        const [selectedRepo, setSelectedRepo] = useState(null);
        const [branchName, setBranchName] = useState('');
        const [worktreeLaunchOption, setWorktreeLaunchOption] = useState('terminal');
        const [launchDangerousMode, setLaunchDangerousMode] = useState(false);
        const [showPromptWorktreeModal, setShowPromptWorktreeModal] = useState(false);
        const [promptText, setPromptText] = useState('');
        const [promptAgent, setPromptAgent] = useState('codex');
        const [promptDangerousMode, setPromptDangerousMode] = useState(false);
        const [promptInputMode, setPromptInputMode] = useState('edit');
        const [activeWorktree, setActiveWorktree] = useState(null);
        const [confirmDelete, setConfirmDelete] = useState(null);
        const [confirmDeleteRepo, setConfirmDeleteRepo] = useState(null);
        const [terminalStatus, setTerminalStatus] = useState('disconnected');
        const [sessionId, setSessionId] = useState(null);
        const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
        const [pendingWorktreeAction, setPendingWorktreeAction] = useState(null);
        const [isAddingRepo, setIsAddingRepo] = useState(false);
        const [isCreatingWorktree, setIsCreatingWorktree] = useState(false);
        const [isDeletingWorktree, setIsDeletingWorktree] = useState(false);
        const [isDeletingRepo, setIsDeletingRepo] = useState(false);
        const [isCreatingPromptWorktree, setIsCreatingPromptWorktree] = useState(false);
        const [isCreatingPlan, setIsCreatingPlan] = useState(false);
        const [pendingActionLoading, setPendingActionLoading] = useState(null);
        const [openActionMenu, setOpenActionMenu] = useState(null);
        const [commandConfig, setCommandConfig] = useState(DEFAULT_COMMAND_CONFIG);
        const [collapsedOrganisations, setCollapsedOrganisations] = useState(() => {
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

        const actionButtonClass = 'inline-flex h-7 w-7 items-center justify-center rounded-md shrink-0 transition-colors';
        const actionMenuRefs = useRef(new Map());

        const getActionMenuRef = useCallback(
          (action) => (node) => {
            if (node) {
              actionMenuRefs.current.set(action, node);
            } else {
              actionMenuRefs.current.delete(action);
            }
          },
          []
        );

        const getCommandForLaunch = useCallback(
          (action, dangerousMode = false) => {
            switch (action) {
              case 'codex':
                return dangerousMode ? commandConfig.codexDangerous : commandConfig.codex;
              case 'claude':
                return dangerousMode ? commandConfig.claudeDangerous : commandConfig.claude;
              case 'ide':
              case 'cursor':
                return commandConfig.cursor;
              case 'vscode':
                return commandConfig.vscode;
              default:
                return undefined;
            }
          },
          [commandConfig]
        );

        const toggleActionMenu = useCallback((action) => {
          setOpenActionMenu((current) => (current === action ? null : action));
        }, []);

        const toggleOrganisationCollapsed = useCallback((org) => {
          setCollapsedOrganisations((current) => {
            const next = { ...current };
            if (next[org]) {
              delete next[org];
            } else {
              next[org] = true;
            }
            return next;
          });
        }, []);

        useEffect(() => {
          if (!openActionMenu) {
            return;
          }
          const handleDocumentClick = (event) => {
            const menuNode = actionMenuRefs.current.get(openActionMenu);
            if (menuNode && !menuNode.contains(event.target)) {
              setOpenActionMenu(null);
            }
          };
          const handleEscape = (event) => {
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

        useEffect(() => {
          if (typeof window === 'undefined') {
            return;
          }
          try {
            window.localStorage.setItem(
              ORGANISATION_COLLAPSE_STORAGE_KEY,
              JSON.stringify(collapsedOrganisations)
            );
          } catch (error) {
            console.warn('Failed to persist organisation collapse state', error);
          }
        }, [collapsedOrganisations]);

        useEffect(() => {
          if (!pendingWorktreeAction) {
            setOpenActionMenu(null);
          }
        }, [pendingWorktreeAction]);

        const notifyAuthExpired = useCallback(() => {
          if (typeof onAuthExpired === 'function') {
            onAuthExpired();
          }
        }, [onAuthExpired]);

        useEffect(() => {
          let cancelled = false;

          const parseCommand = (value, fallback) => {
            if (typeof value === 'string') {
              const trimmed = value.trim();
              if (trimmed) {
                return trimmed;
              }
            }
            return fallback;
          };

          const loadCommands = async () => {
            try {
              const response = await fetch('/api/commands', { credentials: 'include' });
              if (response.status === 401) {
                notifyAuthExpired();
                return;
              }
              if (!response.ok) {
                throw new Error(`Request failed with status ${response.status}`);
              }
              const body = await response.json();
              const commands = body && typeof body === 'object' ? body.commands : null;
              if (!commands || typeof commands !== 'object') {
                return;
              }
              const nextConfig = {
                codex: parseCommand(commands.codex, DEFAULT_COMMAND_CONFIG.codex),
                codexDangerous: parseCommand(
                  commands.codexDangerous,
                  DEFAULT_COMMAND_CONFIG.codexDangerous
                ),
                claude: parseCommand(commands.claude, DEFAULT_COMMAND_CONFIG.claude),
                claudeDangerous: parseCommand(
                  commands.claudeDangerous,
                  DEFAULT_COMMAND_CONFIG.claudeDangerous
                ),
                cursor: parseCommand(
                  commands.cursor ?? commands.ide,
                  DEFAULT_COMMAND_CONFIG.cursor
                ),
                vscode: parseCommand(commands.vscode, DEFAULT_COMMAND_CONFIG.vscode),
              };
              if (!cancelled) {
                setCommandConfig(nextConfig);
              }
            } catch (error) {
              console.error('Failed to load command configuration', error);
            }
          };

          loadCommands();

          return () => {
            cancelled = true;
          };
        }, [notifyAuthExpired]);

        const renderSpinner = (colorClass = '') =>
          h(
            'svg',
            {
              className: ['h-4 w-4 animate-spin', colorClass].filter(Boolean).join(' '),
              viewBox: '0 0 24 24',
              fill: 'none'
            },
            h('circle', {
              className: 'opacity-25',
              cx: '12',
              cy: '12',
              r: '10',
              stroke: 'currentColor',
              strokeWidth: '4'
            }),
            h('path', {
              className: 'opacity-75',
              fill: 'currentColor',
              d: 'M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z'
            })
          );

        const terminalContainerRef = useRef(null);
        const terminalRef = useRef(null);
        const fitAddonRef = useRef(null);
        const socketRef = useRef(null);
        const resizeObserverRef = useRef(null);
        const initSuppressedRef = useRef(false);
        const closedByProcessRef = useRef(false);
        const sessionMapRef = useRef(new Map());
        const sessionKeyByIdRef = useRef(new Map());
        const knownSessionsRef = useRef(new Set());
        const getWorktreeKey = useCallback((org, repo, branch) => `${org}::${repo}::${branch}`, []);

        const applyDataUpdate = useCallback(payload => {
          setData(payload);
          setActiveWorktree(current => {
            if (!current) {
              return current;
            }
            const branches = payload?.[current.org]?.[current.repo] || [];
            if (branches.includes(current.branch) && current.branch !== 'main') {
              return current;
            }
            return null;
          });
          sessionMapRef.current.forEach((session, key) => {
            const [orgKey, repoKey, branchKey] = key.split('::');
            const branches = payload?.[orgKey]?.[repoKey] || [];
            if (!branches.includes(branchKey)) {
              sessionMapRef.current.delete(key);
              sessionKeyByIdRef.current.delete(session);
              knownSessionsRef.current.delete(key);
            }
          });
        }, []);

        const refreshRepositories = useCallback(async () => {
          try {
            const response = await fetch('/api/repos', { credentials: 'include' });
            if (response.status === 401) {
              notifyAuthExpired();
              return;
            }
            if (!response.ok) {
              throw new Error(`Request failed with status ${response.status}`);
            }
            const body = await response.json();
            const payload = body && typeof body === 'object' && body.data ? body.data : {};
            const normalised = Object.fromEntries(
              Object.entries(payload).map(([org, repos]) => [
                org,
                Object.fromEntries(
                  Object.entries(repos || {}).map(([repo, branches]) => [
                    repo,
                    Array.isArray(branches) ? branches : []
                  ])
                )
              ])
            );
            applyDataUpdate(normalised);
          } catch (error) {
            console.error('Failed to load repositories', error);
          }
        }, [applyDataUpdate, notifyAuthExpired]);

        useEffect(() => {
          refreshRepositories();
        }, [refreshRepositories]);

        useEffect(() => {
          if (!REPOSITORY_POLL_INTERVAL_MS || Number.isNaN(REPOSITORY_POLL_INTERVAL_MS)) {
            return () => {};
          }

          let timerId = null;
          let cancelled = false;
          let inFlight = false;

          const isDocumentVisible = () =>
            typeof document === 'undefined' || document.visibilityState !== 'hidden';

          const tick = () => {
            if (cancelled || inFlight || !isDocumentVisible()) {
              return;
            }
            inFlight = true;
            refreshRepositories()
              .catch(() => {})
              .finally(() => {
                inFlight = false;
              });
          };

          timerId = window.setInterval(tick, REPOSITORY_POLL_INTERVAL_MS);

          const handleVisibilityChange = () => {
            if (isDocumentVisible()) {
              tick();
            }
          };

          if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', handleVisibilityChange);
          }

          return () => {
            cancelled = true;
            if (timerId !== null) {
              window.clearInterval(timerId);
            }
            if (typeof document !== 'undefined') {
              document.removeEventListener('visibilitychange', handleVisibilityChange);
            }
          };
        }, [refreshRepositories]);

        const loadSessions = useCallback(async () => {
          try {
            const response = await fetch('/api/sessions', { credentials: 'include' });
            if (response.status === 401) {
              notifyAuthExpired();
              return;
            }
            if (!response.ok) {
              throw new Error(`Request failed with status ${response.status}`);
            }
            const body = await response.json();
            const sessions = Array.isArray(body.sessions) ? body.sessions : [];
            knownSessionsRef.current = new Set(
              sessions
                .map((item) => {
                  if (item && typeof item === 'object') {
                    const { org, repo, branch } = item;
                    if (org && repo && branch) {
                      return `${org}::${repo}::${branch}`;
                    }
                  }
                  return null;
                })
                .filter(Boolean)
            );
          } catch (error) {
            knownSessionsRef.current = new Set();
          }
        }, []);

        useEffect(() => {
          loadSessions();
        }, [loadSessions]);

        useEffect(() => {
          const id = setInterval(() => {
            loadSessions();
          }, 15000);
          return () => clearInterval(id);
        }, [loadSessions]);

        const disposeSocket = useCallback(() => {
          if (socketRef.current) {
            try {
              socketRef.current.close();
            } catch (err) {
              // ignore
            }
            socketRef.current = null;
          }
        }, []);

        const disposeTerminal = useCallback(() => {
          if (terminalRef.current) {
            try {
              terminalRef.current.dispose();
            } catch (err) {
              // ignore
            }
            terminalRef.current = null;
          }
          fitAddonRef.current = null;
          if (terminalContainerRef.current) {
            terminalContainerRef.current.innerHTML = '';
          }
        }, []);

        useEffect(
          () => () => {
            disposeSocket();
            disposeTerminal();
            if (resizeObserverRef.current) {
              resizeObserverRef.current.disconnect();
            }
          },
          [disposeSocket, disposeTerminal]
        );

        const sendResize = useCallback(() => {
          if (!terminalRef.current || !fitAddonRef.current) {
            return;
          }
          fitAddonRef.current.fit();
          if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            const { cols, rows } = terminalRef.current;
            socketRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
          }
        }, []);

        useEffect(() => {
          requestAnimationFrame(() => {
            sendResize();
          });
          const timeout = setTimeout(() => {
            sendResize();
          }, 200);
          return () => clearTimeout(timeout);
        }, [width, isMobileMenuOpen, sessionId, sendResize]);

        useEffect(() => {
          const handler = () => {
            sendResize();
            requestAnimationFrame(() => sendResize());
            setTimeout(() => sendResize(), 200);
          };
          window.addEventListener('resize', handler, { passive: true });
          window.addEventListener('orientationchange', handler, { passive: true });
          return () => {
            window.removeEventListener('resize', handler);
            window.removeEventListener('orientationchange', handler);
          };
        }, [sendResize]);

        useEffect(() => {
          if (!terminalContainerRef.current) {
            return;
          }
          const observer = new ResizeObserver(() => {
            sendResize();
          });
          observer.observe(terminalContainerRef.current);
          resizeObserverRef.current = observer;
          return () => observer.disconnect();
        }, [sendResize]);

        const setupTerminal = useCallback(initialLog => {
          disposeTerminal();
          if (!terminalContainerRef.current) {
            return;
          }
          const term = new Terminal({
            allowTransparency: true,
            convertEol: true,
            cursorBlink: true,
            fontFamily: 'JetBrains Mono, Menlo, Consolas, monospace',
            fontSize: 13,
            theme: {
              background: '#111111',
              foreground: '#f4f4f5',
              cursor: '#f4f4f5'
            },
            scrollback: 8000
          });
          const fitAddon = new FitAddon();
          term.loadAddon(fitAddon);
          terminalRef.current = term;
          fitAddonRef.current = fitAddon;
          term.open(terminalContainerRef.current);
          term.focus();
          if (initialLog) {
            term.write(initialLog);
          }
          term.onData(data => {
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
              socketRef.current.send(JSON.stringify({ type: 'input', data }));
            }
          });
          term.onResize(({ cols, rows }) => {
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
              socketRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
            }
          });
          requestAnimationFrame(() => {
            sendResize();
            term.focus();
          });
        }, [disposeTerminal, sendResize]);

        useEffect(() => {
          const container = terminalContainerRef.current;
          if (!container) {
            return;
          }
          let touchStartY = null;

          const handleWheel = (event) => {
            if (!terminalRef.current) {
              return;
            }
            if (event.deltaY === 0) {
              return;
            }
            event.preventDefault();
            const multiplier = event.deltaMode === 0 ? 1 / 40 : 1; // pixel or line
            const amount = Math.round(event.deltaY * multiplier);
            if (amount !== 0) {
              terminalRef.current.scrollLines(amount);
            }
          };

          const handleTouchStart = (event) => {
            if (!terminalRef.current) {
              return;
            }
            if (event.touches.length === 1) {
              touchStartY = event.touches[0].clientY;
            }
          };

          const handleTouchMove = (event) => {
            if (!terminalRef.current) {
              return;
            }
            if (event.touches.length === 1 && touchStartY !== null) {
              const delta = touchStartY - event.touches[0].clientY;
              if (Math.abs(delta) > 2) {
                event.preventDefault();
                terminalRef.current.scrollLines(Math.round(delta / 30));
                touchStartY = event.touches[0].clientY;
              }
            }
          };

          const handleTouchEnd = () => {
            touchStartY = null;
          };

          container.addEventListener('wheel', handleWheel, { passive: false });
          container.addEventListener('touchstart', handleTouchStart, { passive: false });
          container.addEventListener('touchmove', handleTouchMove, { passive: false });
          container.addEventListener('touchend', handleTouchEnd);
          container.addEventListener('touchcancel', handleTouchEnd);

          return () => {
            container.removeEventListener('wheel', handleWheel);
            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchmove', handleTouchMove);
            container.removeEventListener('touchend', handleTouchEnd);
            container.removeEventListener('touchcancel', handleTouchEnd);
          };
        }, [sessionId]);

        const connectSocket = useCallback(newSessionId => {
          if (!newSessionId) {
            return;
          }
          const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
          const socketUrl = `${protocol}://${window.location.host}/api/terminal/socket?sessionId=${encodeURIComponent(
            newSessionId
          )}`;
          const socket = new WebSocket(socketUrl);
          socketRef.current = socket;

          socket.addEventListener('open', () => {
            setTerminalStatus('connected');
            sendResize();
          });

          socket.addEventListener('message', event => {
            let payload;
            try {
              payload = JSON.parse(event.data);
            } catch (err) {
              return;
            }
            if (payload.type === 'output') {
              if (payload.reset && terminalRef.current) {
                terminalRef.current.reset();
                sendResize();
              }
              if (terminalRef.current && payload.chunk) {
                terminalRef.current.write(payload.chunk);
              }
            } else if (payload.type === 'exit') {
              closedByProcessRef.current = true;
              setTerminalStatus('closed');
              const key = sessionKeyByIdRef.current.get(newSessionId);
              if (key) {
                knownSessionsRef.current.delete(key);
                sessionMapRef.current.delete(key);
                sessionKeyByIdRef.current.delete(newSessionId);
              }
            } else if (payload.type === 'init') {
              if (!initSuppressedRef.current && payload.log && terminalRef.current) {
                terminalRef.current.write(payload.log);
              }
              initSuppressedRef.current = false;
              if (payload.closed) {
                closedByProcessRef.current = true;
                setTerminalStatus('closed');
              }
            } else if (payload.type === 'error') {
              console.error(payload.message || 'Terminal connection error');
              setTerminalStatus('error');
              const key = sessionKeyByIdRef.current.get(newSessionId);
              if (key) {
                knownSessionsRef.current.delete(key);
                sessionMapRef.current.delete(key);
                sessionKeyByIdRef.current.delete(newSessionId);
              }
            }
          });

          socket.addEventListener('close', () => {
            if (closedByProcessRef.current) {
              setTerminalStatus('closed');
            } else {
              setTerminalStatus('disconnected');
            }
          });

          socket.addEventListener('error', () => {
            setTerminalStatus('error');
          });
        }, [sendResize]);

        const openTerminalForWorktree = useCallback(async (worktree, options = {}) => {
          const { command, prompt } = options;
          disposeSocket();
          if (!worktree) {
            disposeTerminal();
            setSessionId(null);
            setTerminalStatus('disconnected');
            return;
          }
          setTerminalStatus('connecting');
          closedByProcessRef.current = false;
          initSuppressedRef.current = true;
          try {
            const payload = { ...worktree };
            if (command) {
              payload.command = command;
            }
            if (prompt !== undefined) {
              payload.prompt = prompt;
            }
            const response = await fetch('/api/terminal/open', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify(payload)
            });
            if (response.status === 401) {
              notifyAuthExpired();
              throw new Error('AUTH_REQUIRED');
            }
            if (!response.ok) {
              throw new Error(`Request failed with status ${response.status}`);
            }
            const body = await response.json();
            const session = body && body.sessionId ? body.sessionId : null;
            const created = body && typeof body.created === 'boolean' ? body.created : false;
            if (!session) {
              throw new Error('Invalid session response');
            }
            setSessionId(session);
            const worktreeKey = getWorktreeKey(worktree.org, worktree.repo, worktree.branch);
            const previousSession = sessionMapRef.current.get(worktreeKey);
            if (previousSession && previousSession !== session) {
              sessionKeyByIdRef.current.delete(previousSession);
            }
            sessionMapRef.current.set(worktreeKey, session);
            sessionKeyByIdRef.current.set(session, worktreeKey);
            knownSessionsRef.current.add(worktreeKey);
            const initialLog = body && typeof body.log === 'string' ? body.log : '';
            setupTerminal(initialLog);
            connectSocket(session);
            setIsMobileMenuOpen(false);
            return { sessionId: session, created };
          } catch (error) {
            console.error('Failed to open terminal session', error);
            disposeTerminal();
            setSessionId(null);
            setTerminalStatus('error');
            throw error;
          }
        }, [connectSocket, disposeSocket, disposeTerminal, setupTerminal, getWorktreeKey, notifyAuthExpired]);

        const handleAddRepo = async () => {
          if (isAddingRepo) {
            return;
          }
          const trimmed = repoUrl.trim();
          if (!trimmed) {
            window.alert('Please enter a repository URL.');
            return;
          }
          setIsAddingRepo(true);
          try {
            const response = await fetch('/api/repos', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ url: trimmed })
            });
            if (response.status === 401) {
              notifyAuthExpired();
              return;
            }
            if (!response.ok) {
              throw new Error(`Request failed with status ${response.status}`);
            }
            const body = await response.json();
            const payload = body && typeof body === 'object' && body.data ? body.data : {};
            applyDataUpdate(payload);
            const info = body && body.repo ? body.repo : null;
            if (info && info.org && info.repo) {
              const branches = payload?.[info.org]?.[info.repo] || [];
              const firstNonMain = branches.find(branch => branch !== 'main');
              if (firstNonMain) {
                const key = getWorktreeKey(info.org, info.repo, firstNonMain);
                if (sessionMapRef.current.has(key) || knownSessionsRef.current.has(key)) {
                  setActiveWorktree({ org: info.org, repo: info.repo, branch: firstNonMain });
                  try {
                    await openTerminalForWorktree({ org: info.org, repo: info.repo, branch: firstNonMain });
                    setPendingWorktreeAction(null);
                  } catch {
                    window.alert('Failed to reconnect to the existing session.');
                  }
                } else {
                  setPendingWorktreeAction({ org: info.org, repo: info.repo, branch: firstNonMain });
                }
                setIsMobileMenuOpen(false);
              } else {
                setActiveWorktree(null);
              }
            }
            setRepoUrl('');
            setShowAddRepoModal(false);
          } catch (error) {
            console.error('Failed to clone repository', error);
            window.alert('Failed to clone repository. Check server logs for details.');
          } finally {
            setIsAddingRepo(false);
          }
        };

        const handleConfirmDeleteRepo = async () => {
          if (isDeletingRepo || !confirmDeleteRepo) {
            return;
          }
          const { org, repo } = confirmDeleteRepo;
          setIsDeletingRepo(true);
          try {
            const response = await fetch('/api/repos', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ org, repo })
            });
            if (response.status === 401) {
              notifyAuthExpired();
              return;
            }
            if (!response.ok) {
              throw new Error(`Request failed with status ${response.status}`);
            }
            const body = await response.json();
            const payload = body && typeof body === 'object' && body.data ? body.data : {};
            applyDataUpdate(payload);
            sessionMapRef.current.forEach((session, key) => {
              const [orgKey, repoKey] = key.split('::');
              if (orgKey === org && repoKey === repo) {
                sessionMapRef.current.delete(key);
                sessionKeyByIdRef.current.delete(session);
                knownSessionsRef.current.delete(key);
              }
            });
            setActiveWorktree(current => {
              if (current && current.org === org && current.repo === repo) {
                return null;
              }
              return current;
            });
            if (
              pendingWorktreeAction &&
              pendingWorktreeAction.org === org &&
              pendingWorktreeAction.repo === repo
            ) {
              setPendingWorktreeAction(null);
            }
            if (
              activeWorktree &&
              activeWorktree.org === org &&
              activeWorktree.repo === repo
            ) {
              disposeSocket();
              disposeTerminal();
              setSessionId(null);
              setTerminalStatus('disconnected');
            }
            setConfirmDeleteRepo(null);
          } catch (error) {
            console.error('Failed to delete repository', error);
            window.alert('Failed to delete repository. Check server logs for details.');
          } finally {
            setIsDeletingRepo(false);
          }
        };

        const handleCreateWorktree = async () => {
          if (isCreatingWorktree) {
            return;
          }
          if (!selectedRepo) return;
          const trimmedBranch = branchName.trim();
          if (!trimmedBranch) return;
          const [org, repo] = selectedRepo;
          setIsCreatingWorktree(true);
          try {
            const response = await fetch('/api/worktrees', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ org, repo, branch: trimmedBranch })
            });
            if (response.status === 401) {
              notifyAuthExpired();
              return;
            }
            if (!response.ok) {
              throw new Error(`Request failed with status ${response.status}`);
            }
            const body = await response.json();
            const payload = body && typeof body === 'object' && body.data ? body.data : {};
            applyDataUpdate(payload);
            const worktree = { org, repo, branch: trimmedBranch };
            const key = getWorktreeKey(org, repo, trimmedBranch);
            const hasKnownSession =
              sessionMapRef.current.has(key) || knownSessionsRef.current.has(key);
            const previousActiveWorktree = activeWorktree;
            setActiveWorktree(worktree);
            const command = !hasKnownSession
              ? getCommandForLaunch(worktreeLaunchOption, launchDangerousMode)
              : null;
            try {
              if (command) {
                await openTerminalForWorktree(worktree, { command });
              } else {
                await openTerminalForWorktree(worktree);
              }
              setPendingWorktreeAction(null);
            } catch (error) {
              if (error && error.message === 'AUTH_REQUIRED') {
                setActiveWorktree(previousActiveWorktree || null);
                return;
              }
              if (hasKnownSession) {
                window.alert('Failed to reconnect to the existing session.');
              } else {
                console.error('Failed to launch the selected option', error);
                window.alert('Failed to launch the selected option. Check server logs for details.');
                setPendingWorktreeAction(worktree);
              }
              setActiveWorktree(previousActiveWorktree || null);
            }
            setIsMobileMenuOpen(false);
            setBranchName('');
            setWorktreeLaunchOption('terminal');
            setLaunchDangerousMode(false);
            setShowWorktreeModal(false);
          } catch (error) {
            console.error('Failed to create worktree', error);
            window.alert('Failed to create worktree. Check server logs for details.');
          } finally {
            setIsCreatingWorktree(false);
          }
        };

        const handleCreatePlan = async () => {
          if (isCreatingPlan) {
            return;
          }
          const hasPrompt = typeof promptText === 'string' && promptText.trim();
          if (!hasPrompt) {
            return;
          }

          setIsCreatingPlan(true);
          try {
            // Ask the backend to draft a structured plan via the OpenAI proxy.
            const response = await fetch('/api/create-plan', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ prompt: promptText })
            });
            if (response.status === 401) {
              notifyAuthExpired();
              return;
            }
            if (!response.ok) {
              throw new Error(`Request failed with status ${response.status}`);
            }
            const body = await response.json();
            const planText =
              body && typeof body === 'object'
                ? typeof body.plan === 'string'
                  ? body.plan
                  : typeof body.content === 'string'
                  ? body.content
                  : ''
                : '';
            if (!planText.trim()) {
              window.alert('Server returned an empty plan. Check server logs for details.');
              return;
            }
            setPromptText(planText);
          } catch (error) {
            console.error('Failed to create plan', error);
            window.alert('Failed to create plan. Check server logs for details.');
          } finally {
            setIsCreatingPlan(false);
          }
        };

        const handleCreateWorktreeFromPrompt = async () => {
          if (isCreatingPromptWorktree) {
            return;
          }
          if (!selectedRepo) {
            return;
          }
          if (!promptText.trim()) {
            window.alert('Please enter a prompt.');
            return;
          }

          const command = getCommandForLaunch(promptAgent, promptDangerousMode);
          if (!command) {
            window.alert('Selected agent command is not configured.');
            return;
          }

          const [org, repo] = selectedRepo;
          const promptValue = promptText;
          setIsCreatingPromptWorktree(true);
          try {
            const response = await fetch('/api/worktrees', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ org, repo, prompt: promptValue })
            });
            if (response.status === 401) {
              notifyAuthExpired();
              return;
            }
            if (!response.ok) {
              throw new Error(`Request failed with status ${response.status}`);
            }
            const body = await response.json();
            const payload = body && typeof body === 'object' && body.data ? body.data : {};
            applyDataUpdate(payload);
            const generatedBranch =
              body && typeof body === 'object' && typeof body.branch === 'string'
                ? body.branch.trim()
                : '';
            if (!generatedBranch) {
              window.alert('Server did not return a branch name. Check server logs for details.');
              return;
            }
            const worktree = { org, repo, branch: generatedBranch };
            const previousActiveWorktree = activeWorktree;
            setActiveWorktree(worktree);
            try {
              await openTerminalForWorktree(worktree, {
                command,
                prompt: promptValue,
              });
              setPendingWorktreeAction(null);
            } catch (error) {
              if (error && error.message === 'AUTH_REQUIRED') {
                setActiveWorktree(previousActiveWorktree || null);
                return;
              }
              console.error('Failed to launch prompt workspace', error);
              window.alert('Failed to launch the selected agent. Check server logs for details.');
              setActiveWorktree(previousActiveWorktree || null);
              setPendingWorktreeAction(worktree);
            }
            setIsMobileMenuOpen(false);
            setPromptText('');
            setPromptAgent('codex');
            setPromptDangerousMode(false);
            setPromptInputMode('edit');
            setShowPromptWorktreeModal(false);
          } catch (error) {
            console.error('Failed to create worktree from prompt', error);
            window.alert('Failed to create worktree. Check server logs for details.');
          } finally {
            setIsCreatingPromptWorktree(false);
          }
        };

        const handleConfirmDelete = async () => {
          if (isDeletingWorktree || !confirmDelete) {
            return;
          }
          const { org, repo, branch } = confirmDelete;
          setIsDeletingWorktree(true);
          try {
            const response = await fetch('/api/worktrees', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ org, repo, branch })
            });
            if (response.status === 401) {
              notifyAuthExpired();
              return;
            }
            if (!response.ok) {
              throw new Error(`Request failed with status ${response.status}`);
            }
            const body = await response.json();
            const payload = body && typeof body === 'object' && body.data ? body.data : {};
            applyDataUpdate(payload);
            const key = getWorktreeKey(org, repo, branch);
            const session = sessionMapRef.current.get(key);
            if (session) {
              sessionMapRef.current.delete(key);
              sessionKeyByIdRef.current.delete(session);
            }
            knownSessionsRef.current.delete(key);
            if (
              activeWorktree &&
              activeWorktree.org === org &&
              activeWorktree.repo === repo &&
              activeWorktree.branch === branch
            ) {
              setActiveWorktree(null);
            }
            setConfirmDelete(null);
          } catch (error) {
            console.error('Failed to remove worktree', error);
            window.alert('Failed to remove worktree. Check server logs for details.');
          } finally {
            setIsDeletingWorktree(false);
          }
        };

        const handleWorktreeSelection = useCallback(async (org, repo, branch) => {
          if (branch === 'main') {
            return;
          }
          const worktree = { org, repo, branch };
          const key = getWorktreeKey(org, repo, branch);
          if (!sessionMapRef.current.has(key) && !knownSessionsRef.current.has(key)) {
            await loadSessions();
          }
          if (sessionMapRef.current.has(key) || knownSessionsRef.current.has(key)) {
            setActiveWorktree(worktree);
            try {
              await openTerminalForWorktree(worktree);
              setPendingWorktreeAction(null);
            } catch (error) {
              if (error && error.message === 'AUTH_REQUIRED') {
                return;
              }
              window.alert('Failed to reconnect to the existing session.');
            }
          } else {
            setPendingWorktreeAction(worktree);
            setIsMobileMenuOpen(false);
          }
        }, [getWorktreeKey, openTerminalForWorktree, loadSessions]);

        const handleWorktreeAction = useCallback(async (action) => {
          if (!pendingWorktreeAction || pendingActionLoading) {
            return;
          }
          setOpenActionMenu(null);
          setPendingActionLoading(action);
          const worktree = pendingWorktreeAction;
          const isDangerous = action.endsWith('-dangerous');
          const resolvedAction = isDangerous ? action.replace(/-dangerous$/, '') : action;
          const command = getCommandForLaunch(resolvedAction, isDangerous);
          setActiveWorktree(worktree);
          try {
            await openTerminalForWorktree(worktree, command ? { command } : {});
            setPendingWorktreeAction(null);
          } catch (error) {
            if (error && error.message === 'AUTH_REQUIRED') {
              return;
            }
            console.error('Failed to launch terminal action', error);
            window.alert('Failed to launch the selected option. Check server logs for details.');
          } finally {
            setPendingActionLoading(null);
          }
        }, [
          openTerminalForWorktree,
          pendingWorktreeAction,
          pendingActionLoading,
          setOpenActionMenu,
          getCommandForLaunch,
        ]);

        const isCodexLoading =
          Boolean(pendingActionLoading && typeof pendingActionLoading === 'string' && pendingActionLoading.startsWith('codex'));
        const isClaudeLoading =
          Boolean(pendingActionLoading && typeof pendingActionLoading === 'string' && pendingActionLoading.startsWith('claude'));
        const isCursorLoading =
          pendingActionLoading === 'cursor' || pendingActionLoading === 'ide';
        const showDangerousModeOption =
          worktreeLaunchOption === 'codex' || worktreeLaunchOption === 'claude';
        const isLaunchOptionDisabled = !branchName.trim();
        const dangerousModeCheckboxId = 'worktree-dangerous-mode';
        const promptDangerousModeCheckboxId = 'prompt-worktree-dangerous-mode';
        const promptPreviewHtml = useMemo(() => renderMarkdown(promptText), [promptText]);
        const promptPreviewIsEmpty = !promptPreviewHtml.trim();
        const showPromptDangerousModeOption = promptAgent === 'codex' || promptAgent === 'claude';
        const isPromptLaunchOptionDisabled = !promptText.trim();

        const statusStyles = {
          connected: 'border border-emerald-500/40 text-emerald-300 bg-emerald-500/15',
          connecting: 'border border-amber-500/40 text-amber-200 bg-amber-500/15',
          closed: 'border border-neutral-700 text-neutral-400 bg-neutral-800',
          error: 'border border-rose-500/40 text-rose-200 bg-rose-500/15',
          disconnected: 'border border-neutral-800 text-neutral-500 bg-neutral-900'
        };
        const statusLabels = {
          connected: 'Connected',
          connecting: 'Connecting…',
          closed: 'Closed',
          error: 'Error',
          disconnected: 'Disconnected'
        };
        const statusClass = statusStyles[terminalStatus] || statusStyles.disconnected;
        const statusLabel = statusLabels[terminalStatus] || statusLabels.disconnected;

        const logoutButton =
          typeof onLogout === 'function'
            ? h(
                'button',
                {
                  type: 'button',
                  onClick: onLogout,
                  disabled: Boolean(isLoggingOut),
                  'aria-busy': isLoggingOut ? 'true' : undefined,
                  className:
                    'inline-flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900/90 px-3 py-2 text-xs font-medium text-neutral-200 shadow-sm transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-70'
                },
                isLoggingOut
                  ? h(
                      Fragment,
                      null,
                      renderSpinner('text-neutral-200'),
                      h('span', null, 'Logging out…')
                    )
                  : h('span', null, 'Log out')
              )
            : null;

        const sidebarContent = h(
          'div',
          { className: 'flex h-full flex-col text-sm font-mono' },
          h(
            'div',
            { className: 'flex-1 min-h-0 overflow-y-auto p-3 space-y-5' },
            Object.entries(data).map(([org, repos]) => {
              const isOrganisationCollapsed = Boolean(collapsedOrganisations[org]);
              return h(
                'div',
                { key: org },
                h(
                  'div',
                  {
                    className:
                      'flex items-center justify-between text-neutral-400 uppercase tracking-wider text-xs mb-1 pl-1'
                  },
                  h('span', { className: 'truncate pr-2' }, org),
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => toggleOrganisationCollapsed(org),
                      className:
                        'inline-flex h-6 w-6 items-center justify-center rounded-md text-neutral-500 transition-colors hover:text-neutral-200',
                      'aria-label': isOrganisationCollapsed
                        ? 'Expand organisation'
                        : 'Collapse organisation',
                      'aria-expanded': isOrganisationCollapsed ? 'false' : 'true'
                    },
                    h(ChevronDown, {
                      size: 14,
                      className: `transition-transform duration-200 ${
                        isOrganisationCollapsed ? '-rotate-90' : 'rotate-0'
                      }`
                    })
                  )
                ),
                !isOrganisationCollapsed &&
                  h(
                    'ul',
                    { className: 'space-y-2' },
                    Object.entries(repos).map(([repo, branches]) =>
                    h(
                      'li',
                      {
                        key: repo,
                        className: 'bg-neutral-900/60 hover:bg-neutral-900 transition-colors rounded-lg px-2 py-1.5'
                      },
                      h(
                        'div',
                        { className: 'flex items-center justify-between gap-2' },
                        h(
                          'div',
                          {
                            className: 'flex items-center space-x-2 cursor-pointer min-w-0 overflow-hidden',
                            onClick: () => {
                              const firstNonMain = branches.find(branch => branch !== 'main');
                              if (firstNonMain) {
                                handleWorktreeSelection(org, repo, firstNonMain).catch(() => {});
                              }
                            }
                          },
                          h(Github, { size: 14, className: 'text-neutral-400 flex-shrink-0' }),
                          h(
                            'span',
                            { className: 'text-neutral-200 whitespace-nowrap overflow-hidden' },
                            repo
                          )
                        ),
                        h(
                          'div',
                          { className: 'flex items-center gap-1 flex-shrink-0' },
                          h(
                            'button',
                            {
                              onClick: () => {
                                setSelectedRepo([org, repo]);
                                setWorktreeLaunchOption('terminal');
                                setLaunchDangerousMode(false);
                                setShowWorktreeModal(true);
                              },
                              className: `${actionButtonClass} text-neutral-400 hover:text-neutral-200`,
                              title: 'Create Worktree'
                            },
                            h(GitPullRequest, { size: 14 })
                          ),
                          h(
                            'button',
                            {
                              onClick: () => {
                                setSelectedRepo([org, repo]);
                                setPromptText('');
                                setPromptAgent('codex');
                                setPromptDangerousMode(false);
                                setPromptInputMode('edit');
                                setShowPromptWorktreeModal(true);
                              },
                              className: `${actionButtonClass} text-neutral-400 hover:text-emerald-300`,
                              title: 'Create Worktree From Prompt'
                            },
                            h(Sparkles, { size: 14 })
                          ),
                          h(
                            'button',
                            {
                              onClick: () => setConfirmDeleteRepo({ org, repo }),
                              className: `${actionButtonClass} text-neutral-500 hover:text-rose-400 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:text-neutral-500`,
                              title: 'Delete Repository',
                              disabled: Boolean(isDeletingRepo),
                              'aria-busy': isDeletingRepo ? 'true' : undefined
                            },
                            h(Trash2, { size: 12 })
                          )
                        )
                      ),
                      h(
                        'ul',
                        { className: 'ml-5 mt-1 space-y-[2px]' },
                        branches.map(branch =>
                          h(
                            'li',
                            { key: branch },
                            h(
                              'div',
                              {
                                className: `flex items-center justify-between rounded-sm px-2 py-2 transition-colors ${
                                  activeWorktree &&
                                  activeWorktree.org === org &&
                                  activeWorktree.repo === repo &&
                                  activeWorktree.branch === branch
                                    ? 'bg-neutral-800 text-neutral-100'
                                    : branch === 'main'
                                    ? 'text-neutral-600'
                                    : 'text-neutral-500 hover:bg-neutral-800/70 hover:text-neutral-100'
                                }`
                              },
                              h(
                                'button',
                                {
                                  type: 'button',
                                  disabled: branch === 'main',
                                  onClick: () => handleWorktreeSelection(org, repo, branch).catch(() => {}),
                                  className: `flex items-center gap-2 min-w-0 overflow-hidden text-left w-full ${
                                    branch === 'main' ? 'cursor-not-allowed' : 'cursor-pointer'
                                  }`
                                },
                                h(GitBranch, { size: 14, className: 'flex-shrink-0' }),
                                h(
                                  'span',
                                  { className: 'whitespace-nowrap overflow-hidden text-ellipsis text-sm' },
                                  branch
                                )
                              ),
                              h(
                                'button',
                                {
                                  onClick: () => {
                                    if (branch === 'main') {
                                      return;
                                    }
                                    setConfirmDelete({ org, repo, branch });
                                  },
                                  disabled: branch === 'main',
                                  className: `${actionButtonClass} disabled:cursor-not-allowed disabled:opacity-60 ${
                                    branch === 'main'
                                      ? 'text-neutral-700 cursor-not-allowed'
                                      : 'text-neutral-500 hover:text-red-400'
                                  }`,
                                  title: branch === 'main' ? 'Main branch cannot be removed' : 'Delete Worktree'
                                },
                                h(Trash2, { size: 12 })
                              )
                            )
                          )
                        )
                      )
                    )
                  )
                )
              );
            })
          ),
          h(
            'div',
            { className: 'border-t border-neutral-800 bg-neutral-925/80 px-3 py-3' },
            h(
              'div',
              { className: 'flex items-center justify-between gap-3' },
              h(
                'button',
                {
                  onClick: () => setShowAddRepoModal(true),
                  className:
                    'inline-flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs font-medium text-neutral-100 transition-colors hover:bg-neutral-800'
                },
                h(Plus, { size: 14 }),
                h('span', null, 'Add Repo')
              ),
              logoutButton
            )
          )
        );

        const desktopSidebar = h(
          Resizable,
          {
            size: { width, height: '100%' },
            onResizeStop: (_event, _direction, _ref, delta) => setWidth(width + delta.width),
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
            }`
          },
          h(
            'div',
            { className: 'h-full w-[88vw] max-w-sm border-r border-neutral-800 bg-neutral-925 relative' },
            sidebarContent,
            h(
              'button',
              {
                onClick: () => setIsMobileMenuOpen(false),
                className: 'absolute top-3 right-3 text-neutral-400 hover:text-neutral-100 transition-colors'
              },
              h(X, { size: 16 })
            )
          )
        );

        const mainPane = h(
          'div',
          { className: 'flex-1 bg-neutral-950 text-neutral-100 font-mono flex flex-col min-h-0' },
          activeWorktree
            ? h(
                'div',
                { className: 'bg-neutral-900 border border-neutral-800 rounded-lg h-full flex flex-col overflow-hidden min-h-0' },
                h(
                  'div',
                  { className: 'flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-900/80' },
                  h(
                    'div',
                    null,
                    h(
                      'div',
                      { className: 'text-xs text-neutral-500' },
                      `${activeWorktree.org}/${activeWorktree.repo}`
                    ),
                    h(
                      'div',
                      { className: 'text-sm text-neutral-300 flex items-center gap-2' },
                      h('span', null, ` ${activeWorktree.branch}`),
                      h(
                        'span',
                        { className: `inline-flex items-center px-2 py-0.5 rounded-md text-2xs uppercase tracking-wide ${statusClass}` },
                        statusLabel
                      )
                    )
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => setIsMobileMenuOpen(true),
                      className:
                        'lg:hidden inline-flex items-center justify-center rounded-md border border-neutral-800 bg-neutral-925 px-2.5 py-2 text-sm text-neutral-300 shadow-sm transition active:scale-[0.97]'
                    },
                    h(Menu, { size: 18 }),
                    h('span', { className: 'sr-only' }, 'Open sidebar')
                  )
                ),
                h('div', {
                  ref: terminalContainerRef,
                  className: 'flex-1 bg-neutral-950 min-h-0 overflow-hidden relative'
                })
            )
          : h(
                'div',
                {
                  className:
                    'bg-neutral-900 border border-neutral-800 rounded-lg h-full flex flex-col overflow-hidden min-h-0'
                },
                h(
                  'div',
                  { className: 'flex justify-end px-4 py-3 border-b border-neutral-800 bg-neutral-900/80' },
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => setIsMobileMenuOpen(true),
                      className:
                        'lg:hidden inline-flex items-center justify-center rounded-md border border-neutral-800 bg-neutral-925 px-2.5 py-2 text-sm text-neutral-300 shadow-sm transition active:scale-[0.97]'
                    },
                    h(Menu, { size: 18 }),
                    h('span', { className: 'sr-only' }, 'Open sidebar')
                  )
                ),
                h(
                  'div',
                  {
                    className:
                      'flex-1 flex items-center justify-center text-neutral-500 px-4 text-center'
                  },
                  h('p', null, 'Select a repository and branch from the left panel')
                )
            )
          );

        return h(
          Fragment,
          null,
          h(
            'div',
            { className: 'flex h-screen bg-neutral-950 text-neutral-100 relative flex-col lg:flex-row min-h-0' },
            desktopSidebar,
            mobileSidebar,
            h(
              'div',
              { className: 'flex-1 h-full w-full lg:w-auto overflow-hidden flex flex-col min-h-0' },
              mainPane
            )
          ),
          showAddRepoModal
            ? h(
                Modal,
                { title: 'Add repository', onClose: () => setShowAddRepoModal(false) },
                h(
                  'div',
                  { className: 'space-y-2' },
                  h(
                    'label',
                    { className: 'block text-xs uppercase tracking-wide text-neutral-400' },
                    'Repository URL'
                  ),
                  h('input', {
                    value: repoUrl,
                    onChange: event => setRepoUrl(event.target.value),
                    placeholder: 'https://github.com/org/repo.git',
                    className:
                      'w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-500/60'
                  })
                ),
                h(
                  'div',
                  { className: 'flex justify-end gap-2 pt-2' },
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => setShowAddRepoModal(false),
                      className: 'px-3 py-2 text-sm text-neutral-400 hover:text-neutral-200'
                    },
                    'Cancel'
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: handleAddRepo,
                      disabled: isAddingRepo,
                      'aria-busy': isAddingRepo,
                      className:
                        'px-3 py-2 text-sm bg-emerald-500/80 hover:bg-emerald-400 text-neutral-900 font-medium rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-emerald-500/80'
                    },
                    isAddingRepo
                      ? h(
                          'span',
                          { className: 'inline-flex items-center gap-2' },
                          renderSpinner('text-neutral-900'),
                          'Adding…'
                        )
                      : 'Add repository'
                  )
                )
              )
            : null,
          showPromptWorktreeModal && selectedRepo
            ? h(
                Modal,
                {
                  title: `Create worktree from prompt for ${selectedRepo[1]}`,
                  onClose: () => {
                    if (!isCreatingPromptWorktree) {
                      setShowPromptWorktreeModal(false);
                      setPromptInputMode('edit');
                    }
                  },
                  size: 'lg',
                  position: 'top'
                },
                h(
                  'div',
                  { className: 'space-y-4' },
                  h(
                    'div',
                    { className: 'space-y-3' },
                    h(
                      'div',
                      { className: 'flex items-center justify-between gap-3' },
                      h(
                        'label',
                        { className: 'block text-xs uppercase tracking-wide text-neutral-400' },
                        'Prompt'
                      ),
                      h(
                        'div',
                        {
                          className:
                            'inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-950 p-0.5'
                        },
                        PROMPT_EDITOR_TABS.map(tab => {
                          const isActive = promptInputMode === tab.value;
                          return h(
                            'button',
                            {
                              key: tab.value,
                              type: 'button',
                              onClick: () => setPromptInputMode(tab.value),
                              className: [
                                'rounded-md px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500/70',
                                isActive
                                  ? 'bg-neutral-800 text-neutral-100 shadow-inner'
                                  : 'text-neutral-400 hover:text-neutral-200'
                              ].join(' '),
                              'aria-pressed': isActive
                            },
                            tab.label
                          );
                        })
                      )
                    ),
                    promptInputMode === 'edit'
                      ? h(
                          Fragment,
                          null,
                          h('textarea', {
                            value: promptText,
                            onChange: event => setPromptText(event.target.value),
                            placeholder: 'Describe the changes you need…',
                            rows: 8,
                            className:
                              'w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-500/60 resize-y min-h-[200px]'
                          }),
                          // Let users pre-generate a plan before opening the agent workspace.
                          h(
                            'button',
                            {
                              type: 'button',
                              onClick: handleCreatePlan,
                              disabled: isCreatingPlan || !promptText.trim(),
                              'aria-busy': isCreatingPlan,
                              className:
                                'mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md border border-neutral-700 bg-neutral-925 px-3 py-2 text-sm text-neutral-200 transition-colors hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-neutral-925'
                            },
                            isCreatingPlan
                              ? h(
                                  'span',
                                  { className: 'inline-flex items-center gap-2' },
                                  renderSpinner('text-neutral-200'),
                                  'Creating…'
                                )
                              : 'Create Plan'
                          )
                        )
                      : h(
                          'div',
                          {
                            className:
                              'markdown-preview min-h-[200px] max-h-[400px] w-full overflow-y-auto rounded-md border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm text-neutral-100 leading-relaxed'
                          },
                          promptPreviewIsEmpty
                            ? h(
                                'p',
                                { className: 'text-sm text-neutral-500 italic' },
                                'Nothing to preview yet.'
                              )
                            : h('div', {
                                className: 'markdown-preview__content space-y-3',
                                dangerouslySetInnerHTML: { __html: promptPreviewHtml }
                              })
                        )
                  ),
                  h(
                    'div',
                    { className: 'space-y-2' },
                    h(
                      'label',
                      { className: 'block text-xs uppercase tracking-wide text-neutral-400' },
                      'Agent'
                    ),
                    h(
                      'div',
                      { className: 'grid grid-cols-3 gap-2' },
                      PROMPT_AGENT_OPTIONS.map(option => {
                        const isActive = promptAgent === option.value;
                        return h(
                          'button',
                          {
                            key: option.value,
                            type: 'button',
                            onClick: () => {
                              setPromptAgent(option.value);
                              if (option.value === 'cursor') {
                                setPromptDangerousMode(false);
                              }
                            },
                            className: [
                              'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                              isActive
                                ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200'
                                : 'border-neutral-700 bg-neutral-950 text-neutral-300 hover:bg-neutral-900'
                            ].join(' ')
                          },
                          option.label
                        );
                      })
                    )
                  ),
                  showPromptDangerousModeOption
                    ? h(
                        'label',
                        {
                          className: 'inline-flex items-center gap-2 text-xs text-neutral-300',
                          htmlFor: promptDangerousModeCheckboxId
                        },
                        h('input', {
                          id: promptDangerousModeCheckboxId,
                          type: 'checkbox',
                          checked: promptDangerousMode,
                          onChange: event => setPromptDangerousMode(event.target.checked),
                          className:
                            'h-4 w-4 rounded border border-neutral-700 bg-neutral-950 text-neutral-100 focus:ring-1 focus:ring-neutral-500'
                        }),
                        'Start in Dangerous Mode'
                      )
                    : null,
                  h(
                    'p',
                    { className: 'text-xs text-neutral-400' },
                    'Branch name will be generated automatically based on your prompt.'
                  )
                ),
                h(
                  'div',
                  { className: 'flex justify-end gap-2 pt-4' },
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => {
                        if (!isCreatingPromptWorktree) {
                          setShowPromptWorktreeModal(false);
                          setPromptInputMode('edit');
                        }
                      },
                      disabled: isCreatingPromptWorktree,
                      className:
                        'px-3 py-2 text-sm text-neutral-400 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:text-neutral-400'
                    },
                    'Cancel'
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: handleCreateWorktreeFromPrompt,
                      disabled: isCreatingPromptWorktree || isPromptLaunchOptionDisabled,
                      'aria-busy': isCreatingPromptWorktree,
                      className:
                        'px-3 py-2 text-sm bg-emerald-500/80 hover:bg-emerald-400 text-neutral-900 font-medium rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-emerald-500/80'
                    },
                    isCreatingPromptWorktree
                      ? h(
                          'span',
                          { className: 'inline-flex items-center gap-2' },
                          renderSpinner('text-neutral-900'),
                          'Launching…'
                        )
                      : 'Create workspace'
                  )
                )
              )
            : null,
          showWorktreeModal && selectedRepo
            ? h(
                Modal,
                {
                  title: `Create worktree for ${selectedRepo[1]}`,
                  onClose: () => {
                    setShowWorktreeModal(false);
                    setWorktreeLaunchOption('terminal');
                    setLaunchDangerousMode(false);
                  }
                },
                h(
                  'div',
                  { className: 'space-y-3' },
                  h(
                    'label',
                    { className: 'block text-xs uppercase tracking-wide text-neutral-400' },
                    'Branch name'
                  ),
                  h('input', {
                    value: branchName,
                    onChange: event => setBranchName(event.target.value),
                    onKeyDown: event => {
                      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
                        event.preventDefault();
                        if (!isCreatingWorktree) {
                          handleCreateWorktree();
                        }
                      }
                    },
                    placeholder: 'feature/my-awesome-branch',
                    className:
                      'w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-500/60'
                  }),
                  h(
                    Fragment,
                    null,
                    h(
                      'label',
                      { className: 'block text-xs uppercase tracking-wide text-neutral-400' },
                      'Launch option'
                    ),
                    h(
                      'select',
                      {
                        value: worktreeLaunchOption,
                        onChange: event => {
                          setWorktreeLaunchOption(event.target.value);
                          setLaunchDangerousMode(false);
                        },
                        disabled: isLaunchOptionDisabled,
                        className:
                          'w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-500/60 disabled:cursor-not-allowed disabled:opacity-60'
                      },
                      WORKTREE_LAUNCH_OPTIONS.map(option =>
                        h(
                          'option',
                          { key: option.value, value: option.value },
                          option.label
                        )
                      )
                    )
                  ),
                  showDangerousModeOption
                    ? h(
                        'label',
                        {
                          className:
                            'inline-flex items-center gap-2 text-xs text-neutral-300',
                          htmlFor: dangerousModeCheckboxId
                        },
                        h('input', {
                          id: dangerousModeCheckboxId,
                          type: 'checkbox',
                          checked: launchDangerousMode,
                          onChange: event => setLaunchDangerousMode(event.target.checked),
                          disabled: isLaunchOptionDisabled,
                          className:
                            'h-4 w-4 rounded border border-neutral-700 bg-neutral-950 text-neutral-100 focus:ring-1 focus:ring-neutral-500 disabled:cursor-not-allowed disabled:opacity-60'
                        }),
                        'Start in Dangerous Mode'
                      )
                    : null
                ),
                h(
                  'div',
                  { className: 'flex justify-end gap-2 pt-2' },
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => {
                        setShowWorktreeModal(false);
                        setWorktreeLaunchOption('terminal');
                        setLaunchDangerousMode(false);
                      },
                      className: 'px-3 py-2 text-sm text-neutral-400 hover:text-neutral-200'
                    },
                    'Cancel'
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: handleCreateWorktree,
                      disabled: isCreatingWorktree || !branchName.trim(),
                      'aria-busy': isCreatingWorktree,
                      className:
                        'px-3 py-2 text-sm bg-emerald-500/80 hover:bg-emerald-400 text-neutral-900 font-medium rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-emerald-500/80'
                    },
                    isCreatingWorktree
                      ? h(
                          'span',
                          { className: 'inline-flex items-center gap-2' },
                          renderSpinner('text-neutral-900'),
                          'Creating…'
                        )
                      : 'Create worktree'
                  )
                )
              )
            : null,
          confirmDelete
            ? h(
                Modal,
                {
                  title: 'Remove worktree',
                  onClose: () => {
                    if (!isDeletingWorktree) {
                      setConfirmDelete(null);
                    }
                  }
                },
                h(
                  'div',
                  { className: 'space-y-3 text-sm text-neutral-300' },
                  h(
                    'p',
                    null,
                    `Remove ${confirmDelete.branch} from ${confirmDelete.repo}?`
                  ),
                  h(
                    'p',
                    { className: 'text-xs text-neutral-500' },
                    'This only detaches the worktree locally. The Git branch remains.'
                  )
                ),
                h(
                  'div',
                  { className: 'flex justify-end gap-2 pt-3' },
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => {
                        if (!isDeletingWorktree) {
                          setConfirmDelete(null);
                        }
                      },
                      disabled: isDeletingWorktree,
                      className:
                        'px-3 py-2 text-sm text-neutral-400 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:text-neutral-400'
                    },
                    'Cancel'
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: handleConfirmDelete,
                      disabled: isDeletingWorktree,
                      'aria-busy': isDeletingWorktree,
                      className:
                        'px-3 py-2 text-sm bg-rose-500/80 hover:bg-rose-400 text-neutral-50 font-medium rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-rose-500/80'
                    },
                    isDeletingWorktree
                      ? h(
                          'span',
                          { className: 'inline-flex items-center gap-2' },
                          renderSpinner('text-neutral-50'),
                          'Removing…'
                        )
                      : 'Remove'
                  )
                )
              )
            : null,
          confirmDeleteRepo
            ? h(
                Modal,
                {
                  title: 'Delete repository',
                  onClose: () => {
                    if (!isDeletingRepo) {
                      setConfirmDeleteRepo(null);
                    }
                  }
                },
                h(
                  'div',
                  { className: 'space-y-3 text-sm text-neutral-300' },
                  h(
                    'p',
                    null,
                    `Delete ${confirmDeleteRepo.org}/${confirmDeleteRepo.repo}?`
                  ),
                  h(
                    'p',
                    { className: 'text-xs text-neutral-500' },
                    'This permanently removes all associated worktrees, terminal sessions, and local checkout data.'
                  )
                ),
                h(
                  'div',
                  { className: 'flex justify-end gap-2 pt-3' },
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => {
                        if (!isDeletingRepo) {
                          setConfirmDeleteRepo(null);
                        }
                      },
                      disabled: isDeletingRepo,
                      className:
                        'px-3 py-2 text-sm text-neutral-400 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:text-neutral-400'
                    },
                    'Cancel'
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: handleConfirmDeleteRepo,
                      disabled: isDeletingRepo,
                      'aria-busy': isDeletingRepo,
                      className:
                        'px-3 py-2 text-sm bg-rose-500/80 hover:bg-rose-400 text-neutral-50 font-medium rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-rose-500/80'
                    },
                    isDeletingRepo
                      ? h(
                          'span',
                          { className: 'inline-flex items-center gap-2' },
                          renderSpinner('text-neutral-50'),
                          'Deleting…'
                        )
                      : 'Delete'
                  )
                )
              )
            : null,
          pendingWorktreeAction
            ? h(
                Modal,
                {
                  title: `Open ${pendingWorktreeAction.repo}`,
                  onClose: () => {
                    if (!pendingActionLoading) {
                      setPendingWorktreeAction(null);
                    }
                  }
                },
                h(
                  'div',
                  { className: 'space-y-3 text-sm text-neutral-300' },
                  h(
                    'p',
                    null,
                    'Choose how you want to start working in this worktree:'
                  ),
                  h(
                    'div',
                    { className: 'space-y-2' },
                    h(
                      'button',
                      {
                        onClick: () => handleWorktreeAction('terminal'),
                        disabled: Boolean(pendingActionLoading),
                        'aria-busy': pendingActionLoading === 'terminal',
                        className:
                          'w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:border-neutral-500 hover:bg-neutral-850 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-neutral-700 disabled:hover:bg-neutral-900'
                      },
                      pendingActionLoading === 'terminal'
                        ? h(
                            'span',
                            { className: 'inline-flex items-center gap-2' },
                            renderSpinner('text-neutral-100'),
                            'Opening…'
                          )
                        : 'Open Terminal'
                    ),
                    h(
                      'button',
                      {
                        onClick: () => handleWorktreeAction('vscode'),
                        disabled: Boolean(pendingActionLoading),
                        'aria-busy': pendingActionLoading === 'vscode',
                        className:
                          'w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:border-neutral-500 hover:bg-neutral-850 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-neutral-700 disabled:hover:bg-neutral-900'
                      },
                      pendingActionLoading === 'vscode'
                        ? h(
                            'span',
                            { className: 'inline-flex items-center gap-2' },
                            renderSpinner('text-neutral-100'),
                            'Opening…'
                          )
                        : 'Open in VS Code'
                    ),
                    h(
                      'div',
                      {
                        className: 'flex items-stretch gap-2',
                        ref: getActionMenuRef('codex')
                      },
                      h(
                        'button',
                        {
                          onClick: () => handleWorktreeAction('codex'),
                          disabled: Boolean(pendingActionLoading),
                          'aria-busy': isCodexLoading,
                          className:
                            'flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:border-neutral-500 hover:bg-neutral-850 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-neutral-700 disabled:hover:bg-neutral-900'
                        },
                        isCodexLoading
                          ? h(
                              'span',
                              { className: 'inline-flex items-center gap-2' },
                              renderSpinner('text-neutral-100'),
                              'Opening…'
                            )
                          : 'Open Codex'
                      ),
                      h(
                        'div',
                        { className: 'relative' },
                        h(
                          'button',
                          {
                            type: 'button',
                            onClick: (event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              toggleActionMenu('codex');
                            },
                            disabled: Boolean(pendingActionLoading),
                            'aria-label': 'Open Codex options',
                            'aria-haspopup': 'menu',
                            'aria-expanded': openActionMenu === 'codex',
                            className:
                              'h-full rounded-md border border-neutral-700 bg-neutral-900 px-2 text-neutral-100 hover:border-neutral-500 hover:bg-neutral-850 transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-neutral-700 disabled:hover:bg-neutral-900 flex items-center justify-center'
                          },
                          h(ChevronDown, { size: 14 })
                        ),
                        openActionMenu === 'codex'
                          ? h(
                              'div',
                              {
                                role: 'menu',
                                className:
                                  'absolute right-0 mt-2 w-48 overflow-hidden rounded-md border border-neutral-700 bg-neutral-900 py-1 text-sm shadow-lg z-10'
                              },
                              h(
                                'button',
                                {
                                  type: 'button',
                                  role: 'menuitem',
                                  onClick: () => handleWorktreeAction('codex-dangerous'),
                                  className:
                                    'block w-full px-3 py-2 text-left text-neutral-100 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60',
                                  disabled: Boolean(pendingActionLoading)
                                },
                                'Dangerous Mode'
                              )
                            )
                          : null
                      )
                    ),
                    h(
                      'button',
                      {
                        onClick: () => handleWorktreeAction('cursor'),
                        disabled: Boolean(pendingActionLoading),
                        'aria-busy': isCursorLoading,
                        className:
                          'w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:border-neutral-500 hover:bg-neutral-850 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-neutral-700 disabled:hover:bg-neutral-900'
                      },
                      isCursorLoading
                        ? h(
                            'span',
                            { className: 'inline-flex items-center gap-2' },
                            renderSpinner('text-neutral-100'),
                            'Launching…'
                          )
                        : 'Launch Cursor'
                    ),
                    h(
                      'div',
                      {
                        className: 'flex items-stretch gap-2',
                        ref: getActionMenuRef('claude')
                      },
                      h(
                        'button',
                        {
                          onClick: () => handleWorktreeAction('claude'),
                          disabled: Boolean(pendingActionLoading),
                          'aria-busy': isClaudeLoading,
                          className:
                            'flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:border-neutral-500 hover:bg-neutral-850 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-neutral-700 disabled:hover:bg-neutral-900'
                        },
                        isClaudeLoading
                          ? h(
                              'span',
                              { className: 'inline-flex items-center gap-2' },
                              renderSpinner('text-neutral-100'),
                              'Opening…'
                            )
                          : 'Open Claude'
                      ),
                      h(
                        'div',
                        { className: 'relative' },
                        h(
                          'button',
                          {
                            type: 'button',
                            onClick: (event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              toggleActionMenu('claude');
                            },
                            disabled: Boolean(pendingActionLoading),
                            'aria-label': 'Open Claude options',
                            'aria-haspopup': 'menu',
                            'aria-expanded': openActionMenu === 'claude',
                            className:
                              'h-full rounded-md border border-neutral-700 bg-neutral-900 px-2 text-neutral-100 hover:border-neutral-500 hover:bg-neutral-850 transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-neutral-700 disabled:hover:bg-neutral-900 flex items-center justify-center'
                          },
                          h(ChevronDown, { size: 14 })
                        ),
                        openActionMenu === 'claude'
                          ? h(
                              'div',
                              {
                                role: 'menu',
                                className:
                                  'absolute right-0 mt-2 w-48 overflow-hidden rounded-md border border-neutral-700 bg-neutral-900 py-1 text-sm shadow-lg z-10'
                              },
                              h(
                                'button',
                                {
                                  type: 'button',
                                  role: 'menuitem',
                                  onClick: () => handleWorktreeAction('claude-dangerous'),
                                  className:
                                    'block w-full px-3 py-2 text-left text-neutral-100 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60',
                                  disabled: Boolean(pendingActionLoading)
                                },
                                'Dangerous Mode'
                              )
                            )
                          : null
                      )
                    )
                  )
                )
              )
            : null
        );
      }

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
                'min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-400 font-mono text-sm'
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
