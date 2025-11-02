**Summary**
- Persist automation task metadata so state in `src/core/tasks.js` survives process restarts and the UI continues to reflect accurate task status.

**Analysis**
- Current `tasks` Map lives only in memory, so any restart drops active/completed task metadata and `/api/tasks` cannot reconcile with the UI.
- Persistence needs to capture enough fields (ids, status, payload, timestamps, progress logs) to faithfully resume or mark tasks failed.
- Startup logic must reload the persisted snapshot, rehydrate in-memory structures, and decide whether to resume runnable tasks or mark them as failed/terminated with context.
- Need a durable location (likely within the configured workdir or a dedicated data directory) plus safeguards against concurrent writes and file corruption.

**Implementation Plan**
- Step 1: Inspect `src/core/tasks.js` and any consumers (task creation/update/completion APIs) to document the task schema and lifecycle hooks that must trigger persistence.
- Step 2: Introduce a persistence utility (e.g. `src/core/task-store.js`) that serializes/deserializes task metadata to a JSON file under a configurable path in the workdir; include atomic write logic (write temp + rename) and file locking or retry to avoid torn writes.
- Step 3: On server bootstrap (likely in `src/server/index.js` or wherever tasks module is initialised), load the persisted snapshot, rebuild the in-memory Map, and for any tasks that were incomplete mark them as `failed` with a `reason` such as `process_restart` (or queue resumable ones if supported).
- Step 4: Wire persistence hooks inside `src/core/tasks.js` so any mutation (create, progress update, completion, cancellation) triggers an async persist call with debouncing/batching to limit disk churn.
- Step 5: Extend API responses (e.g. `/api/tasks`) to surface the new restart-derived status/reason so the UI can display accurate recovery information.
- Step 6: Document configuration/env knobs if the persistence location or retention should be customisable, and ensure the directory is created on demand.

**Testing/Validation**
- Add unit/integration tests exercising task creation, progress updates, completion, and ensuring persisted snapshot matches expectations.
- Simulate a “restart” in tests by creating tasks, forcing a reload from disk, and verifying tasks reappear with correct status (completed stay completed, in-flight marked failed with restart reason).
- Manual smoke test: run server, create tasks, kill process, restart, and confirm UI/API reflects persisted state.

**Potential Risks / Edge Cases**
- Handling corruption or partial writes: need atomic file updates and fallback logic (e.g. discard corrupt snapshot with warning).
- Multiple server instances or clustering could race on the persistence file; clarify single-process assumption or add locking.
- Large task logs could bloat the persistence file; may need to cap stored history or persist only metadata.
- Performance impact from frequent disk writes; consider batching or throttling persistence operations.
- Clarify whether certain task types are resumable; current plan defaults to marking as failed unless resumption semantics are defined.
