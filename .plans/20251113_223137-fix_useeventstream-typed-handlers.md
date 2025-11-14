**Summary**
- Align `useEventStream` to reuse `EventStreamCallbacks` typings so SSE handlers receive strongly typed payloads.

**Analysis**
- `ui/src/hooks/useEventStream.tsx:6-37` currently types the event handlers’ payloads as `any`, even though `EventStreamCallbacks` in `ui/src/types/api.ts:198-205` already defines their shapes (repository, sessions, tasks). This mismatch can hide regressions when backend payloads change because the hook no longer enforces the contract compiled elsewhere. Goal is to have `UseEventStreamOptions` extend `EventStreamCallbacks` and ensure the hook’s internal `createEventStream` registration passes through the right payload types (`RepositoryData`, `{ sessions: WorktreeSession[] }`, `Task[]`).

**Implementation Plan**
1. Update `UseEventStreamOptions` in `ui/src/hooks/useEventStream.tsx` to extend `EventStreamCallbacks`, removing redundant handler definitions.
2. Adjust the hook’s destructured options and defaults to align with the fields from `EventStreamCallbacks`.
3. Modify the callbacks passed to `createEventStream` so each handler signature matches the type definitions (`repository`, `sessions`, `tasks`), ensuring payloads are typed (`RepositoryData`, `{ sessions: WorktreeSession[] }`, `Task[]`).
4. Confirm imports from `ui/src/types/api.ts` (e.g., `EventStreamCallbacks`, `RepositoryData`, `WorktreeSession`, `Task`) are present or added, removing any now-unused types.
5. Ensure TypeScript validates that downstream consumers receive typed callbacks; adjust any hook consumers if compilation reveals stricter typing needs.

**Testing / Validation**
- Run `npm run typecheck` (and `npm run lint` if needed) to confirm the hook and its consumers compile with stronger types.
- Optionally run targeted UI tests (`npm run --workspace ui test -- --passWithNoTests`) if there are specs touching `useEventStream`.

**Potential Risks / Edge Cases**
- Strengthening types may surface previously hidden type errors in hook consumers; these must be fixed or the plan adjusted.
- If `EventStreamCallbacks` changes, the hook must stay in sync to avoid breaking compatibility; ensuring re-exported typing avoids divergence but means a breaking change in `EventStreamCallbacks` has wider impact.
