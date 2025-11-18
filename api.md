# Agentrix Backend API Reference

This document describes the HTTP interface exposed by the Agentrix backend. It is intended for
backend and frontend developers integrating with the service.

The server is a strict-mode TypeScript/Node.js (ESM) application that exposes JSON endpoints under
`/api`. Unless noted otherwise, every endpoint:

- Returns `Cache-Control: no-store`.
- Expects and produces UTF-8 JSON payloads.
- Enforces a 1 MiB request body limit.
- Uses lowercase JSON keys and camelCase field names.
- Sends errors as `{"error": "message"}` with an HTTP status code aligned to the failure.

> **Base URL** – By default the CLI listens on `http://0.0.0.0:3414`. Replace the host and port
> below when the server is configured differently or exposed through a tunnel (ngrok, etc.).

---

## Authentication

Agentrix uses a single password with a secure session cookie.

- **Cookie name** – `terminal_worktree_session`
- **Lifetime** – 8 hours (`Max-Age: 28800`)
- **Cookie flags** – `HttpOnly; SameSite=Strict; Path=/; Secure` (Secure is determined per-request).
- **Workflow**
  1. Authenticate once using `POST /api/auth/login` with the configured password.
  2. The server issues the cookie; include it on every subsequent request.
  3. Unauthenticated requests to protected routes return `401 {"error": "Authentication required"}`.

### `POST /api/auth/login`

| Requires login | Content type | Success |
| -------------- | ------------ | ------- |
| No             | `application/json` | `200 {"authenticated": true}` |

**Request body**
```json
{ "password": "…” }
```
Trims whitespace. Missing or incorrect password returns `400`/`401` with an error message.

### `POST /api/auth/logout`

Clears the session cookie and server-side token cache.

- Success: `200 {"authenticated": false}`
- Always safe to call; no payload required.

### `GET /api/auth/status`

Returns `{ "authenticated": boolean }`. Works without an active session (no 401).

---

## Common Error Handling

All handler wrappers funnel through a shared error middleware:

- Known validation failures return `400`.
- Unknown failures default to `500 {"error": "An unexpected error occurred"}`.
- Authentication failures always yield `401`.
- Non-existent resources return `404`.
- Unsupported methods return `405` with an `Allow` header.

---

## Repository Management

### `GET /api/repos`

Lists every discovered organisation/repository pair and their known branches.

**Response**
```json
{
  "data": {
    "org-one": {
      "repo-a": {
        "branches": ["main", "feature-x"],
        "initCommand": "pnpm install"
      }
    }
  }
}
```

Branches are derived from Git worktrees on disk. `initCommand` is persisted per repo (empty string if unset).
`HEAD` requests return `200` with no body and can be used for cache validation.

### `POST /api/repos`

Clones a new repository into the configured workdir.

**Body**
```json
{ "url": "git@github.com:org/repo.git", "initCommand": "pnpm install" }
```
- `url` (alias `repoUrl`) is required.
- `initCommand` is optional; stored under `<repo-root>/.agentrix/init-command`.

**Response**
```json
{
  "data": { ...same structure as GET /api/repos... },
  "repo": { "org": "org", "repo": "repo" }
}
```

Errors:
- Repository already exists → `400 {"error": "Repository already exists for org/repo"}`.
- Git clone failures bubble up with a descriptive message.

### `DELETE /api/repos`

Removes the repository directory and all associated worktrees.

**Body**
```json
{ "org": "org", "repo": "repo" }
```

**Response**
```json
{ "data": { ...updated repositories map... } }
```

Attempts to delete a non-existent repo return `404` with a Git-derived message.

### `POST /api/repos/init-command`

Stores or clears the per-repository init command.

**Body**
```json
{ "org": "org", "repo": "repo", "initCommand": "pnpm install" }
```

**Response**
```json
{ "data": { ...repositories map... } }
```

### `GET /api/repos/dashboard`

Aggregates GitHub activity and local worktree counts for a repository.

**Query parameters**
- `org` – Required.
- `repo` – Required.

**Response**
```json
{
  "data": {
    "org": "org",
    "repo": "repo",
    "fetchedAt": "2024-03-23T12:34:56.000Z",
    "pullRequests": { "open": 2 },
    "issues": {
      "open": 5,
      "items": [
        {
          "number": 123,
          "title": "Improve docs",
          "createdAt": "2024-03-10T18:00:00.000Z",
          "labels": ["documentation"],
          "url": "https://github.com/org/repo/issues/123"
        }
      ]
    },
    "worktrees": { "local": 3 },
    "workflows": { "running": 1 }
  }
}
```

The handler shells out to the GitHub CLI (`gh`). If `gh` is missing or errors, a `500` with the CLI
message is returned. `HEAD` is supported for health checks.

### `GET /api/repos/issue`

Fetches a single GitHub issue via `gh issue view`.

- Query parameters: `org`, `repo`, `issue` (positive integer).
- Response: `{ "data": { "org", "repo", "issue": {…full GH payload…}, "fetchedAt": ISO8601 } }`
- Fails with `400` for invalid `issue`, `404` if the repo is unknown, or GitHub CLI errors.
- Supports `HEAD`.

---

## Worktree Lifecycle

### `POST /api/worktrees`

Starts an asynchronous worktree creation task. Branch names are normalised and can be generated by
an LLM-backed service when not supplied.

**Body**
```json
{
  "org": "org",
  "repo": "repo",
  "branch": "feature/my-branch",   // optional when branch generator is configured
  "prompt": "Short summary of the goal" // optional; trimmed and stored with the worktree
}
```

- `branch` must not resolve to `main`. Provide an empty string to trigger automatic generation.
- `prompt` is optional; when present the plan is saved under `.plans/*-branch.md`.

**Response (202 Accepted)**
```json
{ "taskId": "uuid", "org": "org", "repo": "repo", "branch": null }
```

The actual branch name (when generated) is surfaced through the task metadata and events (see
`/api/tasks` and `/api/events`). Errors (e.g., branch generation disabled, Git failures) yield `400`
or `500` with descriptive messages.

### `DELETE /api/worktrees`

Removes a worktree and terminates any associated terminal/tmux session.

**Body**
```json
{ "org": "org", "repo": "repo", "branch": "feature/my-branch" }
```

**Response**
```json
{ "data": { ...repositories map... } }
```

Protected branches (`main` or the configured default override) cannot be removed and return
`400 {"error": "Cannot remove the default worktree (…)"}`

---

## Git Status and Diffs

### `GET /api/git/status`

Retrieves an aggregated status snapshot for a worktree.

**Query parameters**
- `org`, `repo`, `branch` – Required. Branch is normalised (`feature/x` → canonical form).
- `entryLimit` – Optional positive integer, limits staged/unstaged/untracked/conflict entries (default 200).
- `commitLimit` – Optional positive integer, limits recent commits (default 10).

**Response**
```json
{
  "status": {
    "fetchedAt": "2024-03-23T12:34:56.000Z",
    "org": "org",
    "repo": "repo",
    "branch": "feature/my-branch",
    "repositoryPath": "/workdir/org/repo/repository",
    "worktreePath": "/workdir/org/repo/feature__my-branch",
    "branchSummary": {
      "head": "feature/my-branch",
      "upstream": "origin/feature/my-branch",
      "ahead": 1,
      "behind": 0,
      "oid": "abc123",
      "detached": false,
      "unborn": false,
      "mergeTarget": null
    },
    "files": {
      "staged": { "items": [ { "path": "src/index.ts", "status": "M", "description": "Modified" } ], "total": 1, "truncated": false },
      "unstaged": { ... },
      "untracked": { ... },
      "conflicts": { ... }
    },
    "operations": {
      "merge": { "inProgress": false, "message": null },
      "rebase": { "inProgress": false, "onto": null, "headName": null, "type": null, "step": null, "total": null },
      "cherryPick": { "inProgress": false, "head": null },
      "revert": { "inProgress": false, "head": null },
      "bisect": { "inProgress": false }
    },
    "commits": {
      "items": [
        { "hash": "abc1234", "author": "Jane Doe", "relativeTime": "2 hours ago", "subject": "Fix bug" }
      ],
      "total": 3,
      "truncated": false
    },
    "totals": { "staged": 1, "unstaged": 0, "untracked": 0, "conflicts": 0 }
  }
}
```

`HEAD` responds with `200` and no body.

### `POST /api/git/diff`

Renders a textual diff for a single file.

**Body**
```json
{
  "org": "org",
  "repo": "repo",
  "branch": "feature/my-branch",
  "path": "src/index.ts",
  "previousPath": "src/index-old.ts", // optional (for renames)
  "mode": "staged"                    // optional: staged | unstaged | untracked | conflict
}
```

**Response**
```json
{
  "path": "src/index.ts",
  "previousPath": "src/index-old.ts",
  "mode": "staged",
  "diff": "--- a/src/index.ts\n+++ b/src/index.ts\n@@ …"
}
```

If the diff is empty, `diff` contains `"No differences to display."` or a fabricated patch for
untracked files. Missing `path` triggers `400 {"error": "path is required"}`.

---

## Terminal Sessions

### `POST /api/terminal/open`

Creates or reuses a (tmux-backed) terminal session for a worktree. When `prompt` is provided the
request is treated as an automation launch and routed through `launchAgentProcess`.

**Body**
```json
{
  "org": "org",
  "repo": "repo",
  "branch": "feature/my-branch",
  "command": "npm test",   // optional unless prompt is supplied
  "prompt": "Fix flaky tests" // optional
}
```

Rules:
- `branch` must not be `main`.
- When `prompt` exists, `command` is required and will receive the prompt as a shell-escaped argument.
- Without `prompt`, the command (if provided) is entered into the shell after session creation.

**Response**
```json
{
  "sessionId": "uuid",
  "log": "Existing terminal scrollback…",
  "closed": false,
  "created": true
}
```

### `POST /api/terminal/send`

Sends raw input to an existing terminal session.

**Body**
```json
{ "sessionId": "uuid", "input": "ls -la\r" }
```

**Response**
```json
{ "ok": true }
```

Sending to a closed or unknown session returns `400 {"error": "Terminal session not found"}`.

### WebSocket Attachment

Terminal output is delivered over WebSockets (see `attachTerminalWebSockets` in `src/server/websocket.ts`),
separate from this REST API. Sessions idle out after ~90 s; activity updates trigger
`sessions:update` events on the SSE endpoint.

### `GET /api/codex-sdk/sessions`

Lists Codex SDK chat sessions for a worktree.

**Query parameters**
- `org` – Required.
- `repo` – Required.
- `branch` – Required.

**Response**
```json
{
  "sessions": [
    {
      "id": "sdk-123",
      "org": "org",
      "repo": "repo",
      "branch": "feature/my-branch",
      "label": "Codex Session",
      "createdAt": "2024-03-01T12:34:56.000Z",
      "lastActivityAt": "2024-03-01T12:36:00.000Z"
    }
  ]
}
```

### `POST /api/codex-sdk/sessions`

Creates a new Codex SDK chat session. Sessions are persisted under `~/.codex/agentrix/worktrees/<slug>/sessions/<id>.json`
so they survive restarts without touching repository files.

**Body**
```json
{
  "org": "org",
  "repo": "repo",
  "branch": "feature/my-branch",
  "label": "Optional tab label"
}
```

**Response**
```json
{
  "session": {
    "id": "sdk-123",
    "org": "org",
    "repo": "repo",
    "branch": "feature/my-branch",
    "label": "Optional tab label",
    "createdAt": "2024-03-01T12:34:56.000Z",
    "lastActivityAt": "2024-03-01T12:34:56.000Z"
  },
  "events": []
}
```

### `GET /api/codex-sdk/sessions/:id`

Returns the saved transcript for a specific session ID (same shape as the `POST` response). Returns
`404 {"error": "Codex session not found"}` when the ID is unknown.

### `DELETE /api/codex-sdk/sessions/:id`

Deletes the stored transcript and closes any matching WebSocket listeners. Responds with `{ "ok": true }`.

### Codex WebSocket Attachment

Once a session ID has been issued, stream updates over a WebSocket connection to
`/api/codex-sdk/socket?sessionId=<id>`. The socket emits:
- `{"type":"history","events":[...]}` immediately after connection.
- `{"type":"event","event":{...}}` for incremental updates (`user_message`, `thinking`, `agent_response`,
  `log`, `usage`, `error`, etc.).
- `{"type":"error","message":"…"}` on failures.

Client messages must be JSON with `{"type":"message","text":"Describe the next step"}` to start a new turn.

---

## Session Discovery

### `GET /api/sessions`

Lists active terminal sessions, combining in-memory PTYs and orphaned tmux sessions.

**Response**
```json
{
  "sessions": [
    {
      "org": "org",
      "repo": "repo",
      "branch": "feature/my-branch",
      "idle": false,
      "lastActivityAt": "2024-03-23T12:34:56.000Z"
    }
  ]
}
```

`HEAD` is supported. The list excludes closed sessions; tmux discovery requires `tmux` to be installed.

---

## Automation Launch API

Automation is exposed via a dedicated endpoint that uses API-key authentication instead of the UI
cookie. The API key must be configured when starting the server (`automationApiKey`).

### `POST /api/automation/launch`

| Requires UI login | Header auth | Success |
| ----------------- | ----------- | ------- |
| No                | `Authorization: Bearer <key>` or `X-API-Key` | `202 {"taskId": "uuid", "data": {…}}` |

**Body**
```json
{
  "repo": "org/repo",
  "command": "codex",          // codex | cursor | claude
  "prompt": "Fix the failing tests", // required when plan=true (default)
  "plan": true,                // optional, defaults to true
  "worktree": "feature/fix tests" // optional descriptor; fallback to branch generator
}
```

Validation rules:
- `repo` must match the `org/repository` format (`.git` suffix is allowed and stripped).
- `command` is mapped to the configured agent command:
  - `codex` → `codexDangerous` (fallback to `codex`), `cursor`, or `claude` → `claudeDangerous`.
- `plan` defaults to `true`. When disabled the `prompt` is passed through unchanged.
- `worktree` is slugified into a branch name. If omitted, a branch-name generator must be configured;
  otherwise a `503` is returned.
- Requests missing or with an invalid API key receive `401`.

**Response**
```json
{
  "taskId": "uuid",
  "data": {
    "org": "org",
    "repo": "repo",
    "branch": "feature-generated-slug",
    "repositoryPath": null,
    "worktreePath": null,
    "clonedRepository": null,
    "createdWorktree": null,
    "agent": "codex",
    "agentCommand": "codex --dangerously-bypass-approvals-and-sandbox",
    "pid": null,
    "terminalSessionId": null,
    "terminalSessionCreated": false,
    "tmuxSessionName": null,
    "terminalUsingTmux": false,
    "plan": true,
    "promptRoute": "create-plan",
    "automationRequestId": "uuid-string"
  }
}
```

Field values are placeholders until the asynchronous task progresses. Task updates stream through
`/api/tasks` and `/api/events`. Failures (e.g., plan generator missing, git errors) return `4xx/5xx`
with specific messages.

> Metrics for automation requests are tracked in-memory (see `automationPlanMetrics`) but are not
> exposed via the API.

---

## Plan Generation & Artifacts

### `POST /api/create-plan`

Runs a configured plan LLM to synthesise a plan without launching automation.

**Body**
```json
{
  "prompt": "Summarise the migration steps",
  "rawPrompt": false,      // optional, default false
  "dangerousMode": false,  // optional, default false
  "org": "org",            // optional but must accompany repo
  "repo": "repo"
}
```

- `prompt` is required and trimmed.
- When both `org` and `repo` are supplied, the CLI runs inside `<workdir>/<org>/<repo>/repository`.
- Missing `planService` configuration returns `500`.
- Unknown repositories return `404`.

**Response**
```json
{ "plan": "### Proposed Tasks\n1. …" }
```

### `GET /api/plans`

Lists plan markdown files (`.plans/<timestamp>-<branch>.md`) for a worktree.

**Query parameters**
- `org`, `repo`, `branch` – Required.
- `limit` – Optional positive integer.

**Response**
```json
{
  "data": [
    { "id": "20240323_123456-feature_my-branch.md", "branch": "feature/my-branch", "createdAt": "2024-03-23T12:34:56.000Z" }
  ]
}
```

Invalid parameters return `400`. Missing worktree yields `404`.

### `GET /api/plans/content`

Reads a specific plan file.

**Query parameters**
- `org`, `repo`, `branch` – Required.
- `planId` – Required (`<timestamp>-<branch>.md`). Validates branch suffix to prevent traversal.

**Response**
```json
{
  "data": {
    "id": "20240323_123456-feature_my-branch.md",
    "branch": "feature/my-branch",
    "createdAt": "2024-03-23T12:34:56.000Z",
    "content": "### Proposed Tasks\n…"
  }
}
```

Unknown identifiers return `404`.

---

## Configuration Endpoint

### `GET /api/commands`

Returns the resolved agent command configuration.

**Response**
```json
{
  "commands": {
    "codex": "codex",
    "codexDangerous": "codex --dangerously-bypass-approvals-and-sandbox",
    "claude": "claude",
    "claudeDangerous": "claude --dangerously-skip-permissions",
    "cursor": "cursor-agent",
    "vscode": "code ."
  }
}
```

`HEAD` is supported.

---

## Task Tracking

### `GET /api/tasks`

Returns every in-memory task, ordered by creation time.

**Response**
```json
{
  "tasks": [
    {
      "id": "uuid",
      "type": "worktree:create",
      "title": "Create worktree for org/repo",
      "status": "running",          // pending | running | succeeded | failed
      "createdAt": "2024-03-23T12:00:00.000Z",
      "updatedAt": "2024-03-23T12:05:00.000Z",
      "completedAt": null,
      "metadata": {
        "org": "org",
        "repo": "repo",
        "branch": "feature/my-branch",
        "promptProvided": true,
        "status": "running",
        "repositoryPath": "/…",
        "worktreePath": "/…",
        "error": null
      },
      "steps": [
        {
          "id": "generate-branch",
          "label": "Generate branch name",
          "status": "succeeded",    // pending | running | succeeded | skipped | failed
          "startedAt": "2024-03-23T12:00:01.000Z",
          "completedAt": "2024-03-23T12:00:02.000Z",
          "logs": [
            { "id": "uuid", "message": "Generated branch feature/my-branch.", "timestamp": "2024-03-23T12:00:02.000Z" }
          ]
        }
      ],
      "result": null,
      "error": null
    }
  ]
}
```

Completed tasks are retained for 15 minutes before being pruned. `HEAD` is supported.

### `GET /api/tasks/:id`

Fetches a single task by ID.

- Success: `200 {"task": { …same structure as list… } }`
- Missing task: `404 {"error": "Task not found"}`
- Invalid methods: `405`

`HEAD` returns `200` for existing IDs.

---

## Server-Sent Events (`/api/events`)

Continuous event stream used by the UI to stay in sync.

- Requires an authenticated UI session (cookie).
- Endpoint: `GET /api/events`
- Response headers:
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-store`
  - `Connection: keep-alive`
  - `X-Accel-Buffering: no`
- Heartbeats are sent every 15 s as comments (`: ping <timestamp>`).

### Initial Snapshots

Immediately after connection the server emits:

```
event: repos:update
data: {"data": {…repositories map…}}

event: sessions:update
data: {"sessions": [{…}]}

event: tasks:update
data: {"tasks": [{…}]}   // emitted only if tasks exist
```

### Live Events

Event types are defined in `core/event-bus.ts`:

- `repos:update` – Repository structure changed (e.g., worktree added/removed).
- `sessions:update` – Terminal sessions list changed (activity/idle/closed).
- `tasks:update` – A task was created, updated, completed, or pruned.

Each event is JSON-encoded and follows the same structure as the respective REST response.

If an unrecoverable error occurs during streaming the server emits:
```
event: error
data: {"error": "Failed to stream events"}
```
and closes the connection.

---

## Miscellaneous Notes

- **Request idempotency** – All GET/HEAD requests are side-effect free. POST/DELETE operations are
  best-effort and rely on Git/tmux side effects; retries may need manual clean-up if the underlying
  command partially succeeded.
- **Workdir layout** – `<workdir>/<org>/<repo>/repository` contains the main clone; worktrees live at
  `<workdir>/<org>/<repo>/<branch-name>/`.
- **External dependencies**
  - `git` must be available on `PATH`.
  - `tmux` is optional but enables shared sessions and automation launches.
  - `gh` (GitHub CLI) is required for the repository dashboard/issue endpoints.
- **Automation plan storage** – Plans are stored under `.plans/` inside each worktree. Saving a plan
  automatically stages the directory (`git add -A .plans`).
- **Terminal buffer** – Session logs are truncated to the last 200000 characters.

---

## Example Session (cURL)

```bash
# 1. Log in and capture the session cookie
curl -c cookie.txt \
     -H "Content-Type: application/json" \
     -d '{"password":"<password>"}' \
     http://localhost:3414/api/auth/login

# 2. List repositories
curl -b cookie.txt http://localhost:3414/api/repos

# 3. Kick off a worktree creation
curl -b cookie.txt \
     -H "Content-Type: application/json" \
     -d '{"org":"org","repo":"repo","branch":"","prompt":"Implement feature"}' \
     http://localhost:3414/api/worktrees

# 4. Poll task status
curl -b cookie.txt http://localhost:3414/api/tasks/<taskId>

# 5. Stream live updates (Server-Sent Events)
curl -N -b cookie.txt http://localhost:3414/api/events
```

For automation integrations, authenticate with an API key:

```bash
curl -H "Content-Type: application/json" \
     -H "Authorization: Bearer <automationApiKey>" \
     -d '{"repo":"org/repo","command":"codex","prompt":"Fix login bug","plan":true}' \
     http://localhost:3414/api/automation/launch
```

---

This reference covers every backend endpoint currently exposed by Agentrix. Keep it alongside the
Agent Handbook to stay aligned with architectural and operational expectations.
