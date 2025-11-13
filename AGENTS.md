# Agentrix Agent Guide

## Mission
- Maintain the Node 20+ TypeScript ESM backend (`src/`) and the Vite + React frontend (`ui/`) with strict typing, SOLID responsibilities, and DRY helpers.
- Default to pure modules, dependency injection, and clear feature boundaries; no side effects in shared utilities.

## Layout Snapshot
- `bin/agentrix.js` boots the CLI, loading compiled files from `dist/`.
- Backend: `src/api/*` HTTP handlers, `src/core/*` domain logic (auth, git, terminal, worktrees, tasks, plans, github), `src/server/*` bootstrap + WebSocket wiring, and `src/utils/*` shared helpers.
- Frontend: `ui/src/app` (entry), shared `components/`, cross-cutting `hooks/`, feature bundles under `ui/src/features/*/{components,hooks,modals}`, services in `ui/src/services/api`, shared `types/`, `utils/`, and `config/`. Imports always end with `.js` even when the file is `.ts/.tsx`.
- Native shells live in `mobile/` (iOS + macOS). Treat them as first-class clients that must stay in lockstep with the web UI feature set—and vice versa.
- Build artifacts live in `dist/` and `ui/dist/`; never edit them manually.

## Development Loop (Always TDD)
1. Write or update a failing test first (`src/**/*.test.ts` or UI Vitest specs).
2. Implement the smallest change that makes the test pass, keeping modules isolated and reusing helpers before adding new ones.
3. Keep the loop tight: run `npm run lint`, `npm run typecheck`, and `npm run test` after every meaningful change; do not proceed while anything is red.
4. Validate the UI workspace when relevant via `npm run --workspace ui test -- --passWithNoTests`.
5. Finish with `npm run build:backend`, `npm run build:ui`, or `npm run build` to ensure both bundles ship cleanly.

## Runtime & Tooling Commands
- `npm run dev` serves the backend plus the built UI (`ui/dist`).
- `npm run dev:ui` launches the Vite dev server (remember to rebuild with `npm run build:ui` before relying on the backend to serve assets).
- Formatting and fixes: `npm run format`, `npm run format:fix`, `npm run lint:fix`.

## Quality Guardrails
- Treat lint, test, and typecheck output as blockers; rerun them frequently instead of batching.
- Keep TypeScript strict: avoid `any`, prefer explicit interfaces in `src/types` and `ui/src/types` (or feature-local types when truly scoped).
- Enforce SOLID: domain logic stays under `src/core`, UI feature logic stays inside its feature folder, and shared utilities remain framework-agnostic.
- Stay DRY: extract duplicate flows into helpers or hooks, and centralize modal rendering via the existing modal containers rather than scattered dialogs.
- Maintain platform parity across clients: any UX/functionality change merged under `ui/` or `mobile/` must include the corresponding implementation in the other platform(s), or a documented parity plan (same PR) plus matching tests/checklists, so web, iOS, and macOS always ship the same feature set at release time.
