# terminal-worktree

`terminal-worktree` is a password-protected CLI that serves a browser-based interface for managing
Git repositories, worktrees, and persistent shell sessions. The backend is an ES module Node.js
service that exposes REST + WebSocket APIs, while the frontend is a Vite-powered React application
that lives in `ui/`.

## Prerequisites

- Node.js 18 or newer
- Git (for cloning repositories and creating worktrees)

## Install Dependencies

From the repository root:

```bash
npm install
```

Install frontend dependencies separately:

```bash
cd ui
npm install
```

## Build the Frontend

The backend serves pre-built assets from `ui/dist`. Build them once (or whenever the UI changes):

```bash
npm run build          # Invokes `vite build` in ui/
```

The build artefacts land in `ui/dist/` and are picked up automatically by the CLI defaults.

## Running the CLI

After building the UI:

```bash
npm start
```

or directly:

```bash
node bin/terminal-worktree.js
```

By default the server binds to `0.0.0.0:3414`, serves assets from `ui/dist`, and scans the current
working directory for repositories. Customise behaviour with flags:

```bash
node bin/terminal-worktree.js \
  --port 4000 \
  --host 127.0.0.1 \
  --ui ./ui/dist \
  --workdir /path/to/workdir \
  --password secret
```

### CLI Options

- `-p, --port <number>` – HTTP port (default: `3414`)
- `-H, --host <host>` – Bind address (default: `0.0.0.0`)
- `-u, --ui <path>` – Directory or entry file for the built UI (default: `ui/dist`)
- `-w, --workdir <path>` – Root directory that holds `org/repo` folders (default: process CWD)
- `-P, --password <string>` – UI password (default: secure random string generated at startup)
- `--show-password` – Print the resolved password even if it was set via config or flag
- `--ngrok-api-key <token>` – Authtoken used to establish a public ngrok tunnel
- `--ngrok-domain <domain>` – Reserved ngrok domain exposed when tunnelling (requires `--ngrok-api-key`)
- `--save` – Persist the effective configuration to `~/.terminal-worktree/config.json` and exit
- `-h, --help` – Print usage
- `-v, --version` – Show package version

When both ngrok flags are supplied the CLI will establish a tunnel after the HTTP server boots and
print the public URL. If either flag is omitted the service remains reachable only via the bound host
and port.

### Configuration File

At startup the CLI also reads `~/.terminal-worktree/config.json` if it exists. Any values in that file
fill in defaults for matching CLI options, while explicit command-line arguments always win. A simple
configuration might look like:

```json
{
  "port": 4001,
  "host": "127.0.0.1",
  "ui": "./ui/dist",
  "workdir": "/srv/worktrees",
  "password": "s3cr3t",
  "commands": {
    "codex": "codex",
    "cursor": "cursor-agent",
    "vscode": "code ."
  },
  "ngrok": {
    "apiKey": "NGROK_AUTHTOKEN",
    "domain": "example.ngrok.app"
  },
  "automation": {
    "apiKey": "AUTOMATION_API_KEY"
  }
}
```

Supported keys mirror the CLI flags (`port`, `host`, `ui`, `workdir`, `password`, individual
`*Command` entries, plus `ngrokApiKey`/`ngrokDomain` or `ngrok.apiKey` / `ngrok.domain`). The
automation API key can be supplied as `automation.apiKey`, `automationApiKey`, or `apiKey`. Leave
the file absent to continue using only CLI arguments.

Run `terminal-worktree --port 4001 --workdir /srv/worktrees --save` to save the provided values into
the config file without starting the server.

### Authentication

When the CLI generates a password it prints the value once at startup. If you supply a password via
CLI flag or config file it is kept out of stdout; pass `--show-password` if you still need the value
echoed. Clients must authenticate before calling API endpoints.
Successful logins receive an HTTP-only session cookie; log out via the UI or `POST
/api/auth/logout`. On shutdown the backend cleans up shell sessions, tmux attachments, and WebSocket
clients.

### Automation API

When `config.json` includes an automation API key the backend exposes a machine-consumable endpoint
for provisioning worktrees and launching agents.

- Endpoint: `POST /api/automation/launch`
- Headers: `X-API-Key: <key>` (alternatively `Authorization: Bearer <key>`)
- Body shape:

  ```json
  {
    "repo": "org/repository",
    "worktree": "type/title",
    "command": "codex",
    "prompt": "Kick off the task at hand",
    "plan": true
  }
  ```

The server uses `codex`, `cursor`, or `claude` agent commands configured via `config.json`, cloning
`git@github.com:org/repository.git` if necessary, creating (or reusing) the specified worktree, and
then launching the agent inside the same tmux-backed terminal session that the UI attaches to. When
`plan` is omitted or set to `true` the submitted prompt is first transformed via the **Create Plan**
pipeline (powered by the configured local LLM); set `"plan": false` to preserve the original prompt and bypass
planning. The request responds with `202 Accepted` once the terminal session is ready and includes
metadata about the repository, worktree, agent command, process `pid`, terminal identifiers
(`terminalSessionId`, `terminalSessionCreated`, `terminalUsingTmux`, `tmuxSessionName` when
applicable), plus the automation metadata `plan`, `promptRoute`, and `automationRequestId`. Automated
launches therefore appear immediately inside the UI terminal. The effective prompt (planned or
passthrough) is exported to the session as `TERMINAL_WORKTREE_PROMPT` and appended to the initial
agent command so automation invocations receive it straight away.

### Plan Artifacts

Automation runs (and prompt-driven worktree creation) persist Markdown plans inside each worktree
under `.plans/`. Access them without SSHing into the worktree:

- `GET /api/plans?org=<org>&repo=<repo>&branch=<branch>` – returns the newest plan identifiers and
  timestamps for the requested worktree.
- `GET /api/plans/content?...&planId=<file>` – streams the selected plan’s contents in Markdown.
- CLI helper: `terminal-worktree plans list --org <org> --repo <repo> --branch <branch>` followed by
  `terminal-worktree plans show --org <org> --repo <repo> --branch <branch> --plan-id <file>` to
  render Markdown locally.

The server prunes older artifacts, keeping the 20 most recent plans per branch by default. Delete
entries manually if you need to reclaim space sooner.

### Real-time Updates

After authentication the UI opens a Server-Sent Events stream at `GET /api/events` to receive
push notifications:

- `repos:update` — emits the full repository/worktree snapshot (equivalent to `GET /api/repos`).
- `sessions:update` — lists active terminal sessions (subset of `GET /api/sessions`).

When the stream is unavailable the client automatically falls back to minute-level polling to keep
state in sync.

### Repository Layout & Worktrees

The work directory is expected to follow:

```
[workdir]/
  org/
    repo/
      repository/      # main checkout
      <worktree-name>/ # additional worktrees
```

Use **Add Repo** to clone into this structure, **Create Worktree** to branch from up-to-date
`origin/main`, and **Delete Worktree** to remove worktrees (except `main`, which is intentionally
protected). Terminal sessions are backed by `node-pty` and optionally tmux so reconnects resume the
previous shell.

## Development Workflow

- `npm run dev` – Start the backend CLI.
- `npm run dev:ui` – Run the Vite dev server (hot-module reloading React).
- `npm run preview` – Serve the production build through Vite.
- `npm run build` – Generate production assets in `ui/dist`.

During local development run the backend CLI (`npm run dev`) alongside the Vite dev server (`npm run
dev:ui`). Use the dev server URL directly in the browser while exercising APIs exposed by the CLI.
