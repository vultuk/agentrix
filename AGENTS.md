# Terminal-Worktree Agent Handbook

This handbook captures the working knowledge required to extend or maintain the `terminal-worktree`
console application now that the project has been restructured into a modular backend and a modern
React frontend.

## 1. Architecture Overview
- **Backend** – ES module Node.js service under `src/` responsible for authentication, Git
  orchestration, worktree lifecycle, and PTY-backed terminal sessions (with optional tmux
  attachment). HTTP endpoints are organised by feature area under `src/api/`, domain logic under
  `src/core/`, shared helpers in `src/utils/`, and server/bootstrap code in `src/server/`.
- **Frontend** – Vite + React application in `ui/` built with TailwindCSS/PostCSS and xterm.js. The
  production build lives in `ui/dist/` and is served by the backend. During development the Vite dev
  server (`npm run dev:ui`) provides hot reloading.

## 2. File Layout Highlights
- `bin/terminal-worktree.js` – CLI entry point (imports `src/cli.js`).
- `src/cli.js` – argument parsing, server startup, shutdown orchestration.
- `src/server/index.js` – HTTP server bootstrap, routing, WebSocket wiring.
- `src/server/ui.js` – static asset serving (supports single files and built directories).
- `src/api/*` – request handlers (`auth`, `repos`, `sessions`, `terminal`, `worktrees`).
- `src/core/*` – shared domain modules (`auth`, `git`, `terminal-sessions`, `tmux`, `workdir`).
- `src/utils/*` – helpers (`cookies`, `http`, `random`).
- `ui/` – frontend source (`src/`), Tailwind/Vite config, and `dist/` build output.
- `.gitignore` – excludes `node_modules`, `ui/node_modules`, and `ui/dist`.

## 3. CLI Usage

```bash
node bin/terminal-worktree.js [options]
```

Arguments (see `src/cli.js`):
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

## 4. Workdir Expectations & Git Flow
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

## 5. Terminal Sessions
- Sessions keyed by `org::repo::branch` and tracked in-memory (`core/terminal-sessions`).
- `/api/terminal/open` returns existing sessions or spawns new PTYs (`node-pty`) and attaches tmux
  when available.
- Shell command respects `process.env.SHELL` and launches with `-il` for bash/zsh/fish.
- `/api/terminal/socket` upgrades to WebSocket, streams PTY IO, handles resize, and replays buffered
  output (trimmed to 200k chars). Authentication is validated during upgrade using session cookies.
- `/api/sessions` merges in-memory sessions with live tmux sessions to restore orphaned terminals.

## 6. Frontend Behaviour
- Built with React function components and hooks (mirrors the original mockup functionality).
- TailwindCSS + PostCSS deliver the utility classes formerly provided by `cdn.tailwindcss.com`.
- `re-resizable` powers the sidebar resize on desktop; mobile view swaps to a hamburger drawer.
- Modals cover Add Repo, Create Worktree, Delete Worktree, and “How do you want to open this
  worktree?” action chooser (Terminal/VS Code/Codex/Cursor/Claude auto-fill terminal input on first launch).
- xterm.js + fit addon render the terminal, preserve scrollback, and keep geometry synced via
  `ResizeObserver`.

## 7. Auth & Session Notes
- `core/auth` manages session tokens and cookie serialisation. Login failures surface 400/401 with
  descriptive messages.
- Cookies: `SameSite=Strict`, `HttpOnly`, path `/`, and session max-age `8h`.
- Logout clears the session cookie and in-memory token set.

## 8. Shutdown Path
- `startServer` exposes `close()` which:
  - Terminates PTY/tmux sessions (escalating from `SIGTERM` to `SIGKILL` after 2s if required).
  - Closes the WebSocket server and HTTP server.
  - Clears auth session tokens/maps.

## 9. Frontend Build & Dev
- `npm run build` (root) → runs Vite build under `ui/` to refresh `ui/dist`.
- `npm run dev:ui` → Vite dev server with HMR.
- Backend serving expects `ui/dist` to exist; rebuild after UI changes before using the CLI.
- Access the dev server directly in the browser when iterating on frontend features; backend APIs
  continue to run on port `3414`.

## 10. Troubleshooting
- **Missing `ui/dist`** – `createUiProvider` throws `UI path not found`. Run `npm run build`.
- **Auth errors / 401** – Usually indicates expired session; login again or inspect cookie.
- **Terminal stuck `disconnected`** – Investigate WebSocket connection in browser console, check
  logs for tmux availability, and ensure `/api/terminal/open` succeeded.
- **Git failures** – API responses include stderr/messages; check console output for command details.
- **Deprecated xterm packages** – Vite warns that upstream packages are deprecated; switching to
  `@xterm/*` addons is a future improvement.

## 11. Practices & Constraints
- Preserve existing ESM structure; avoid reintroducing CommonJS.
- Stay within ASCII unless a file already includes Unicode.
- Avoid destructive Git commands; never revert user-authored changes without direction.
- UI changes should honour the established layout and behaviour.

## 12. Future Enhancements
- Validate existence of helper binaries (`codex`, `cursor-agent`, `claude`) before auto-running them.
- Improve error messaging for Git/tmux failures surfaced to the UI.
- Consider clean-up when worktrees are removed while users are still connected (auto-close sessions).

Refer to this handbook whenever you return to the project to stay aligned with the agreed design and
workflow.
