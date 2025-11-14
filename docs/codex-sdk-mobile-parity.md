# Codex SDK Mobile Parity Plan

Web supports launching Codex SDK chat sessions from the worktree modal and pending action dialog. The
iOS/macOS shells need matching functionality. Planned steps:

1. **Add launch option** – Update `WorktreeCommandAction` and the terminal launch sheets to include a
   “Codex SDK” action that triggers the new `/api/codex-sdk/sessions` endpoint instead of a terminal command.
2. **Chat transport** – Add a small client for `POST /api/codex-sdk/sessions` plus the
   `/api/codex-sdk/socket` WebSocket to stream events and submit `{type:"message"}` payloads.
3. **Chat UI** – Build a lightweight SwiftUI view that mirrors the web panel (ready status, thinking,
   user/agent bubbles, usage + error badges, send box).
4. **State management** – Store Codex SDK sessions per worktree so that switching tabs reuses the same
   session ID and history, keeping parity with the browser.
5. **Testing** – Extend `AgentrixMobileTests` with fixtures for the new endpoint and socket payloads.

Until the above is implemented, the mobile shells will continue launching only the CLI-based automations.
