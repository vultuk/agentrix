# ai-worktrees CLI

This repository hosts the early prototype of the `ai-worktrees` console application. The first milestone is a small CLI that serves the static UI mockup in `ui.sample.html` so that it is accessible in a browser.

## Prerequisites

- Node.js 18 or newer (the CLI uses the built-in HTTP server and modern JavaScript features).

## Usage

From the repository root run:

```bash
node bin/ai-worktrees.js
```

By default the UI is served from `ui.sample.html` on port `3414` and bound to `0.0.0.0`. Customise this behaviour with flags:

```bash
node bin/ai-worktrees.js --port 4000 --host 127.0.0.1 --ui path/to/file.html
```

### CLI Options

- `-p, --port <number>`: Port for the HTTP server (default: `3414`).
- `-H, --host <host>`: Host/interface to bind (default: `0.0.0.0`).
- `-u, --ui <path>`: Path to the UI HTML file to serve (default: `ui.sample.html`).
- `-w, --workdir <path>`: Root directory that contains cloned repositories (default: current working directory).
- `-h, --help`: Display the usage information.
- `-v, --version`: Print the package version.

The server keeps running until you terminate the process (e.g. `Ctrl+C`). The mock UI loads React
and supporting libraries from public CDNs, so make sure the machine running the browser has
internet access. Repository entries in the sidebar are populated from the given work directory
following the structure `[workdir]/org-name/repo-name/repository`. Using the **Add Repo** button
will clone the given repository URL into that structure automatically, and the embedded terminal
connects over WebSockets to a `node-pty` session so aliases, login scripts, and interactive tools
behave exactly as they do in your local shell. The default `main` branch is visible but intentionally
blocked from opening a terminal session or being deleted. Each new worktree is created only after the
`repository` checkout pulls the latest `origin/main`, ensuring fresh state before branching. When you
open a worktree for the first time the UI offers quick actions (Terminal, Codex, Cursor, Claude) that
automatically bootstrap the appropriate tool; subsequent visits reconnect to the existing shell.
