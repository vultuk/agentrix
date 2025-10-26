# Terminal-Worktree Agent Handbook

This document captures the working knowledge gathered while building and operating the `terminal-worktree` console app. It is intended as a quick-start reference for future agents so the project can be resumed without rediscovering prior decisions.

## 1. Overview
- `terminal-worktree` is a CLI that serves the React-based UI in `ui.sample.html` over HTTP.
- The backend (`src/server.js`) manages:
  - Git repository discovery and cloning into a fixed structure.
  - Worktree creation/removal, with safeguards around the `main` branch.
  - Persistent PTY-backed terminal sessions exposed via WebSockets.
- The frontend uses CDN-hosted React + Tailwind (via `cdn.tailwindcss.com`) and xterm.js to render the UI. Mobile and desktop layouts are supported, including a hamburger sidebar for small screens.

## 2. File Layout
- `bin/terminal-worktree.js` – CLI entry point (thin wrapper around `src/cli.js`).
- `src/cli.js` – command-line argument parsing, server startup, graceful shutdown handling.
- `src/server.js` – HTTP + WebSocket server, Git and PTY orchestration.
- `ui.sample.html` – full UI (React + JSX via CDN ESM modules).
- `README.md` – basic usage instructions (now aligned with the new name).
- `AGENTS.md` – this guide.

## 3. Running the CLI
```bash
node bin/terminal-worktree.js [options]
```

Options (from `src/cli.js`):
- `-p, --port <number>` – HTTP port (default `3414`).
- `-H, --host <host>` – Bind interface (default `0.0.0.0`).
- `-u, --ui <path>` – UI HTML file (default `ui.sample.html`).
- `-w, --workdir <path>` – Working directory root; if omitted, uses the process CWD.
- `-h, --help` – Show usage.
- `-v, --version` – Print the package version.

On startup the CLI logs the resolved UI path, working directory, and accessible URL. The process listens for `SIGINT`/`SIGTERM` and calls `server.close()` plus PTY cleanup.

## 4. Workdir & Repository Structure
- Expected layout when cloning `git@github.com:org/repo.git`:
  ```
  [workdir]/
    org/
      repo/
        repository/      # main checkout
        <worktree-name>/ # additional worktrees (one per branch)
  ```
- `/api/repos` builds the sidebar by scanning this structure with `discoverRepositories`.
- The **Add Repo** modal triggers `/api/repos` (POST) which:
  1. Parses the repo URL.
  2. Creates `[workdir]/org/repo/`.
  3. Clones into `repository/`.
- Creating a worktree (`/api/worktrees`, POST) performs:
  1. `git checkout main` inside `repository`.
  2. `git pull --ff-only origin main`.
  3. `git worktree add ...` (creates branch if missing).
- Deleting a worktree (`/api/worktrees`, DELETE) calls `git worktree remove --force`.
- `main`:
  - Cannot be opened as a terminal.
  - Cannot be deleted.

## 5. Terminal Sessions
- Terminal sessions are keyed by `org::repo::branch`.
- `/api/terminal/open` returns existing sessions or spawns new PTYs with `node-pty`.
- The shell defaults to `process.env.SHELL` (spawned with `-il` for common shells), so aliases/profile scripts load (addressing the earlier “standard terminal” concern).
- When the UI launches Codex/Cursor/Claude, it posts `{ command: 'codex' | 'cursor-agent' | 'claude' }`; the backend writes the command to the PTY only when the session is newly created.
- Sessions persist across refreshes; the UI polls `/api/sessions` every 15s and keeps session maps in memory so existing terminals reconnect automatically.
- `/api/terminal/send` forwards typed input; `/api/terminal/socket` streams PTY IO and window resize events.
- Scrollback (8k lines) and wheel/touch scrolling are enabled in the xterm wrapper.

## 6. Frontend Notes
- Desktop: resizable sidebar (horizontal only, per user request); terminal pane fills remaining space.
- Mobile:
  - Sticky top bar with hamburger icon (lucide `Menu` icon).
  - Sidebar slides in full-screen; selecting a worktree closes it.
  - Terminal view becomes full-screen when active.
- Modals:
  - Add Repo: triggers clone.
  - Create Worktree: prompts for branch, then `git pull` + `worktree add`.
  - Delete Worktree: confirmation before removal.
  - Worktree action chooser: shown only when no existing session is found; options map to Terminal/Codex/Cursor/Claude.
- Terminal status badge reflects current state (`connecting`, `connected`, `closed`, `error`, `disconnected`).
- The terminal container uses ResizeObserver + window resize/orientation listeners to keep the PTY size in sync; vertical sizing honors available space and allows shrinking the browser window.

## 7. Shutdown Behavior
- The CLI listens for Ctrl+C; earlier reports mentioned repeated “Shutting down…” logs. The current implementation guards against duplicate shutdown attempts with `shuttingDown` and calls `closeAll()` (server + PTYs).
  - If multiple interrupts are still observed, double-check for long-running PTY tear-down; `terminateSession` escalates from `SIGTERM` to `SIGKILL` after 2s.

## 8. Troubleshooting Tips
- **`{"error":"command is not defined"}`** – resolved by ensuring `/api/terminal/open` reads `payload.command` only once and passes it along when the PTY is first created (already fixed).
- **PTY command availability** – if Codex/Cursor/Claude binaries are absent, the command will fail silently in the shell; consider verifying presence or surfacing stdout/stderr in future work.
- **MaxListeners warnings** – can appear if many sessions are opened without closing; `closeAll()` now tears down watchers, but watch logs if the warning reappears.
- **Noise from Tailwind CDN warning** – expected from `cdn.tailwindcss.com`, acceptable for this prototype.

## 9. Development Constraints & Practices
- Live testing was paused per user instruction (“continue without live testing”).
- Do not revert user changes; avoid destructive Git commands without explicit request.
- Maintain ASCII (unless existing files use other encodings).
- Keep UI true to the provided mockup; avoid introducing extra UI elements without instruction.

## 10. Next Steps / Open Questions
- Optional: add verification that tool binaries (`codex`, `cursor-agent`, `claude`) exist before launching.
- Consider backend cleanup when a worktree is deleted while a session is active (currently relies on `/api/sessions` polling).
- Potential enhancement: richer error reporting on clone/worktree failures beyond generic alerts.

Refer back to this guide whenever you revisit the project to stay aligned with established decisions and user expectations.

