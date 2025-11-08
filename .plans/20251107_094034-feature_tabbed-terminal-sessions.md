**Tab-Based Terminals Plan**
- **Summary:** Add multi-tab terminal/agent sessions inside a worktree so users can open several terminals or coding agents concurrently, with tabs displayed above the existing terminal pane and a “+” action for new sessions.
- **Analysis:** Today a worktree automatically spins up one session bound to the chosen terminal/agent; UI shows only that single instance. We must extend the session model and UI to hold multiple concurrent sessions per worktree, render tabs, and allow users to create additional sessions that reuse the existing session-spawn logic. Need to confirm whether sessions are shared between backend and frontend or if the UI simply requests new ones; assume `src/core/terminal` or related APIs already expose “create session” endpoints we can call repeatedly with the same worktree ID.
- **Implementation Plan:**
  1. **Backend API support:**  
     - Verify/create endpoint in `src/api/terminal` (or related controller) that can create a new session given worktree + tool type; ensure it returns an identifier and metadata required by UI (name, tool label, status).  
     - Confirm ws events in `src/server` emit session lifecycle events (opened/closed) for multiple sessions and patch types/interfaces if necessary (`src/core/tasks` or shared types).
  2. **Shared types:**  
     - Update `src/types` and mirrored `ui/src/types` to represent a worktree session list (`TerminalSession` with id, label, tool, status) so UI and backend stay aligned.
  3. **Frontend state:**  
     - In the worktree/terminal feature (likely `ui/src/features/worktree/...`), store an array of sessions; on load fetch the initial session list.  
     - Add reducers/hooks to set active tab, add/remove sessions, and subscribe to backend events. Reuse existing DI/config patterns.
  4. **Tab UI:**  
     - Create a tab bar component inside the worktree terminal panel (e.g., `TabbedTerminalBar` under `ui/src/features/worktree/components`). Show each session name/tool; highlight active tab; include close icon if supported.  
     - Add a “+” button aligned right that invokes the “create session” modal or quick action; prompt the user to choose terminal vs agent if multiple types exist, then call backend to create and push into session array.
  5. **Terminal viewport:**  
     - Render the existing terminal/agent component using the active session. Ensure switching tabs rebinds to the correct websocket/pty stream; clean up listeners when switching.
  6. **Session management:**  
     - Handle session closures (manual or backend) by removing from the tab list and selecting the nearest remaining tab; if none remain, offer “+” state.  
     - Persist last active session per worktree (in component state or view model) so reconnects restore the same tab.
  7. **Styling & accessibility:**  
     - Update CSS modules/tailwind tokens so tabs look native to Agentrix UI (hover/focus states, overflow handling). Ensure keyboard navigation works (arrow keys, enter).
- **Testing / Validation:**  
  - Backend: add/unit-test session creation endpoint, ensuring multiple sessions map to one worktree without collisions.  
  - Frontend: add Vitest/RTL coverage for the tab reducer/hook and the tab bar component (render tabs, activate, add via “+”).  
  - Manual smoke: start worktree, open multiple tabs with different tools, switch between them while commands run, close tabs, reload page to ensure active session persists or reloads gracefully.
- **Risks / Edge Cases:**  
  - Race conditions when multiple tabs spawn simultaneously; ensure backend returns unique IDs and UI updates atomically.  
  - Long-running processes might die if session sockets are reattached incorrectly during tab switches—must maintain per-session connection objects.  
  - Need UX for errors when session creation fails (display toast + keep existing tabs untouched).  
  - Consider resource limits (e.g., max tabs) to avoid runaway session creation; document or enforce server-side guardrails if required.
