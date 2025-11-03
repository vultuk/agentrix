You are a senior full-stack developer working with modern frameworks. You write clean, maintainable code and follow SOLID, DRY, and YAGNI principles.

**Summary**
- Flag idle PTY/tmux sessions by tracking last activity, toggling an idle state after 90 s of silence, and broadcasting that state to the UI.
- Surface idle worktrees in the sidebar by colouring their branch labels emerald until the user acknowledges them by opening the worktree.

**Key Changes**
- Add backend session bookkeeping (timestamps, idle flag, periodic sweep) so SSE updates include idle status without spamming on every chunk.
- Extend SSE and REST session payloads with `lastActivityAt`/`idle`, keeping consumers backwards compatible.
- Rework the React sidebar to store per-worktree session metadata, manage acknowledgement state, and conditionally apply the idle colour.

**File-Level Actions**
- src/core/terminal-sessions.js:92 – update `queueSessionInput` and `handleSessionOutput` to reset `lastActivityAt`, clear idle state, and trigger session updates when transitioning from idle to active.
- src/core/terminal-sessions.js:148 – introduce module-level idle timeout constants, store `lastActivityAt`/`idle` on session objects, and add a shared idle monitor that marks sessions idle after 90 s then emits `emitSessionsUpdate` with the enriched payload.
- src/core/terminal-sessions.js:155 – expand `serialiseSessions` to return `idle` and ISO `lastActivityAt`, and ensure cleanup paths clear monitor timers when no sessions remain.
- src/server/events.js:14 – include the new fields in initial session snapshots and downstream SSE events so the UI receives consistent metadata.
- src/api/sessions.js:24 – mirror the enriched session shape in the REST response (defaulting tmux-discovered sessions to `idle: false` / `lastActivityAt: null`) to keep fallback flows aligned.
- ui/src/App.jsx:1514 – refactor `syncKnownSessions` to maintain a `Map` of session metadata plus a React state snapshot, clearing acknowledgements when sessions go active.
- ui/src/App.jsx:2738 – on `handleWorktreeSelection`, record the acknowledgement timestamp/state before opening the terminal so the highlight clears immediately.
- ui/src/App.jsx:3172 – adjust branch row class generation to apply an emerald text colour (e.g., `text-emerald-400`) when the session is idle and unacknowledged, falling back to existing active/hover styles otherwise.

**Testing & Validation**
- Run `npm test` (or project-equivalent) to ensure no regressions in shared utilities.
- Manually verify: open a worktree, produce terminal output, wait >90 s without activity to confirm the sidebar turns green, click the worktree to reset, then trigger new output to ensure the highlight disappears until the next idle period.
- Confirm SSE reconnects deliver the idle metadata correctly by refreshing the UI mid-idle and observing consistent highlighting.

**Risks & Assumptions**
- Assumes broadcasting only on idle/active transitions keeps SSE load manageable even for chatty sessions.
- Idle acknowledgement is tracked per browser session; multiple clients viewing the same worktree will each see their own highlight state.

**Next Steps**
- After implementation, consider making the idle timeout user-configurable or exposing it in settings.
- Evaluate whether additional UI affordances (badge counts, tooltip text) would further clarify idle session status for users.
