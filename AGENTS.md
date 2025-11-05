# Terminal-Worktree Agent Handbook

This handbook captures the working knowledge required to extend or maintain the `terminal-worktree`
console application now that the project has been restructured into a modular TypeScript backend and a modern
React frontend.

## 1. Architecture Overview
- **Backend** – TypeScript ES module Node.js service under `src/` responsible for authentication, Git
  orchestration, worktree lifecycle, and PTY-backed terminal sessions (with optional tmux
  attachment). HTTP endpoints are organised by feature area under `src/api/`, domain logic under
  `src/core/`, shared helpers in `src/utils/`, and server/bootstrap code in `src/server/`.
- **Frontend** – Vite + React application in `ui/` built with TailwindCSS/PostCSS and xterm.js. The
  production build lives in `ui/dist/` and is served by the backend. During development the Vite dev
  server (`npm run dev:ui`) provides hot reloading.
- **TypeScript** – Full strict-mode TypeScript with comprehensive type safety. All source files are `.ts`.

## 2. File Layout Highlights
- `bin/terminal-worktree.js` – CLI entry point (imports compiled `dist/cli.js`).
- `src/cli.ts` – Modular CLI organized under `src/cli/` with focused modules.
- `src/cli/` – CLI modules: arg parsing, config management, validation, command handlers.
- `src/server/` – HTTP server bootstrap, routing, WebSocket wiring, UI serving.
- `src/api/` – Request handlers (`auth`, `repos`, `sessions`, `terminal`, `worktrees`, `automation`).
- `src/core/` – Domain modules (`auth`, `git`, `terminal-sessions`, `tmux`, `tasks`, `plan`, `github`).
- `src/utils/` – Utilities (`cookies`, `http`, `random`, `errors`).
- `ui/` – Frontend source (`src/`), Tailwind/Vite config, and `dist/` build output.
- `dist/` – Compiled TypeScript output (gitignored).
- `.gitignore` – Excludes `node_modules`, `ui/node_modules`, `ui/dist`, and `dist`.

## 3. Frontend Architecture

The frontend follows a feature-based architecture organized by domain to promote modularity, reusability, and 
separation of concerns. The structure adheres to SOLID and DRY principles.

### Directory Structure

```
ui/src/
├── app/                          # Entry point & application root
│   ├── App.tsx                   # Main application component with AuthProvider
│   └── main.tsx                  # Application bootstrap
├── components/                   # Reusable presentational components
│   ├── Badge.tsx                 # UI atoms/molecules with no business logic
│   ├── Button.tsx
│   ├── Input.tsx
│   ├── Modal.tsx
│   ├── Spinner.tsx
│   └── ...
├── features/                     # Domain-specific modules (self-contained)
│   ├── auth/
│   │   └── components/           # Auth-specific components
│   ├── repositories/
│   │   ├── components/           # Repository UI components
│   │   │   ├── RepoBrowser.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── modals/
│   │   └── hooks/                # Repository business logic hooks
│   ├── worktrees/
│   │   ├── components/modals/
│   │   └── hooks/
│   ├── tasks/
│   │   ├── components/
│   │   └── hooks/
│   ├── plans/
│   │   ├── components/modals/
│   │   └── hooks/
│   ├── terminal/
│   │   ├── components/
│   │   └── hooks/
│   └── github/
│       ├── components/
│       └── hooks/
├── hooks/                        # Shared hooks (framework-level utilities)
│   ├── useDebounce.tsx
│   ├── usePolling.tsx
│   ├── useEventStream.tsx
│   └── ...
├── context/                      # React contexts for global state
│   └── AuthContext.tsx           # Authentication state & handlers
├── hoc/                          # Higher-order components (guards, wrappers)
├── services/                     # API clients & data access
│   └── api/
│       ├── api-client.ts
│       ├── authService.ts
│       ├── reposService.ts
│       └── ...
├── utils/                        # Pure helper functions (no React dependency)
│   ├── constants.ts
│   ├── formatting.ts
│   ├── validation.ts
│   └── ...
├── types/                        # Shared TypeScript interfaces & enums
│   ├── api.ts
│   ├── domain.ts
│   └── ...
├── config/                       # Configuration & constants
│   ├── commands.ts
│   └── tasks.ts
└── styles.css                    # Global styles
```

### Key Principles

1. **Feature Isolation** – Each feature module is self-contained with its own components, hooks, and business 
   logic. Features do not directly import from each other.

2. **Component Organization**:
   - `components/` – Pure presentational components with no business logic or API calls
   - `features/*/components/` – Feature-specific components that may contain business logic
   - Components use the `.js` extension in imports despite being `.tsx` files (ESM requirement)

3. **Hook Organization**:
   - `hooks/` – Framework-level, truly reusable hooks (debounce, polling, event streams)
   - `features/*/hooks/` – Feature-specific business logic hooks (e.g., `useTaskManagement`, 
     `useRepositoryOperations`)

4. **State Management**:
   - `context/AuthContext.tsx` – Centralized authentication state via React Context
   - Local state management within features using React hooks
   - No global state library (Zustand/Redux) currently used

5. **Import Patterns**:
   - Cross-feature imports go through shared layers (`components/`, `hooks/`, `utils/`, `services/`, `types/`)
   - Features import from: `../../../components/`, `../../../hooks/`, `../../../services/`, etc.
   - Shared hooks import from: `../../hooks/`, `../../utils/`, etc.
   - Always use `.js` extensions in imports (TypeScript + ESM requirement)

6. **Type Safety** – All TypeScript with strict mode. Shared types in `types/`, feature-specific types 
   co-located or in shared types.

### Common Patterns

- **Modal Container** – `features/terminal/components/ModalContainer.tsx` aggregates all modals from different 
  features for centralized rendering
- **Feature Hooks** – Complex features expose multiple hooks (e.g., repositories has `useRepoBrowserState`, 
  `useRepositoryData`, `useRepositoryOperations`)
- **Service Layer** – All API calls go through `services/api/*` for consistency and error handling
- **Authentication** – `AuthContext` provides `useAuth()` hook for auth state and handlers throughout the app

## 4. CLI Usage

```bash
node bin/terminal-worktree.js [options]
```

Arguments (see `src/cli.ts` and `src/cli/` modules):
- `-p, --port <number>` – HTTP port (default `3414`).
- `-H, --host <host>` – Bind interface (default `0.0.0.0`).
- `-u, --ui <path>` – Built UI directory or entry file (default `ui/dist`).
- `-w, --workdir <path>` – Root of the Git worktree structure (default: process CWD).
- `-P, --password <string>` – Explicit UI password (default: random 12-char string printed at
  startup).
- `-h, --help` – Usage information.
- `-v, --version` – Package version (resolved via JSON import).

The CLI logs the resolved UI root, work directory, listening address, and password. Shutdown is
guarded against duplicate signals and cleans up HTTP, WebSocket, tmux, and PTY resources.

## 5. Workdir Expectations & Git Flow
- Repository layout for `git@github.com:org/repo.git`:
  ```
  [workdir]/
    org/
      repo/
        repository/      # main checkout
        <worktree-name>/ # additional worktrees (one per branch)
  ```
- `/api/repos` reads this structure via `core/git.discoverRepositories`.
- Adding a repo (`POST /api/repos`) parses the URL, ensures the `org/repo` folder exists, and clones
  into `repository/`.
- Creating a worktree (`POST /api/worktrees`):
  1. Ensures `repository/` exists.
  2. Checks out `main` and fast-forwards with `git pull --ff-only origin main`.
  3. Adds the worktree (creating the branch if needed).
- Removing a worktree (`DELETE /api/worktrees`) disposes active sessions, kills tmux mirrors, and
  runs `git worktree remove --force`. Branch `main` remains protected.

## 6. Terminal Sessions
- Sessions keyed by `org::repo::branch` and tracked in-memory (`core/terminal-sessions`).
- `/api/terminal/open` returns existing sessions or spawns new PTYs (`node-pty`) and attaches tmux
  when available.
- Shell command respects `process.env.SHELL` and launches with `-il` for bash/zsh/fish.
- `/api/terminal/socket` upgrades to WebSocket, streams PTY IO, handles resize, and replays buffered
  output (trimmed to 200k chars). Authentication is validated during upgrade using session cookies.
- `/api/sessions` merges in-memory sessions with live tmux sessions to restore orphaned terminals.

## 7. Frontend Behaviour
- Built with React function components and hooks (mirrors the original mockup functionality).
- TailwindCSS + PostCSS deliver the utility classes formerly provided by `cdn.tailwindcss.com`.
- `re-resizable` powers the sidebar resize on desktop; mobile view swaps to a hamburger drawer.
- Modals cover Add Repo, Create Worktree, Delete Worktree, and “How do you want to open this
  worktree?” action chooser (Terminal/VS Code/Codex/Cursor/Claude auto-fill terminal input on first launch).
- xterm.js + fit addon render the terminal, preserve scrollback, and keep geometry synced via
  `ResizeObserver`.

## 8. Auth & Session Notes
- `core/auth` manages session tokens and cookie serialisation. Login failures surface 400/401 with
  descriptive messages.
- Cookies: `SameSite=Strict`, `HttpOnly`, path `/`, and session max-age `8h`.
- Logout clears the session cookie and in-memory token set.

## 9. Shutdown Path
- `startServer` exposes `close()` which:
  - Terminates PTY/tmux sessions (escalating from `SIGTERM` to `SIGKILL` after 2s if required).
  - Closes the WebSocket server and HTTP server.
  - Clears auth session tokens/maps.

## 10. Frontend Build & Dev
- `npm run build` (root) → runs Vite build under `ui/` to refresh `ui/dist`.
- `npm run dev:ui` → Vite dev server with HMR.
- Backend serving expects `ui/dist` to exist; rebuild after UI changes before using the CLI.
- Access the dev server directly in the browser when iterating on frontend features; backend APIs
  continue to run on port `3414`.

## 11. Troubleshooting
- **Missing `ui/dist`** – `createUiProvider` throws `UI path not found`. Run `npm run build`.
- **Auth errors / 401** – Usually indicates expired session; login again or inspect cookie.
- **Terminal stuck `disconnected`** – Investigate WebSocket connection in browser console, check
  logs for tmux availability, and ensure `/api/terminal/open` succeeded.
- **Git failures** – API responses include stderr/messages; check console output for command details.
- **Deprecated xterm packages** – Vite warns that upstream packages are deprecated; switching to
  `@xterm/*` addons is a future improvement.

## 12. Practices & Constraints
- **TypeScript**: All backend code is TypeScript with strict mode enabled.
- **ESM**: Preserve existing ES module structure; avoid reintroducing CommonJS.
- **Imports**: Use `.js` extensions in import statements (TypeScript + Node ESM requirement).
- **Types**: Maintain comprehensive type safety; avoid `any` types.
- **SOLID**: Follow SOLID principles and clean architecture patterns.
- **Git**: Avoid destructive Git commands; never revert user-authored changes without direction.
- **UI**: Changes should honour the established layout and behaviour.

## 13. Development Commands
- `npm run typecheck` – Run TypeScript type checking
- `npm run build:backend` – Compile TypeScript to `dist/`
- `npm run build:ui` – Build frontend to `ui/dist`
- `npm run build` – Build both backend and frontend
- `npm run dev` – Start development backend
- `npm run dev:ui` – Start Vite dev server with HMR

## 14. Future Enhancements
- Validate existence of helper binaries (`codex`, `cursor-agent`, `claude`) before auto-running them.
- Improve error messaging for Git/tmux failures surfaced to the UI.
- Consider clean-up when worktrees are removed while users are still connected (auto-close sessions).
- Migrate to `@xterm/*` packages when upstream deprecations are resolved.

Refer to this handbook whenever you return to the project to stay aligned with the agreed design and
workflow.
