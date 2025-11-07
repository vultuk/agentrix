**Summary**
- Provide a ports tunneling dropdown (instead of the current sidebar) that is always available in the header, regardless of whether the user is in a worktree, a repository dashboard, or the blank “select a repo” state.

**Analysis**
- The current tunneling UI lives exclusively inside `PortsSidebar` and is only mounted for active worktrees (`ui/src/features/terminal/components/MainPane.tsx:63`), so the feature disappears elsewhere.
- The action bar only exposes the Server icon/button when `activeWorktree` exists (`ui/src/hooks/useActionBar.tsx:71-99`), reinforcing the same limitation.
- Worktree navigation even tracks `closePortsSidebar` hooks (`ui/src/features/worktrees/hooks/useWorktreeSelection.tsx:24-66`), demonstrating that the sidebar is tightly coupled to the terminal layout.
- No comments on the issue, so we assume the goal is UX consistency: expose tunneling everywhere and change the form factor to a dropdown similar to `TaskMenu`.

**Implementation Plan**
1. **Extract reusable tunneling state**
   - Create a hook (e.g., `ui/src/features/ports/hooks/usePortsMenuState.ts`) that wraps the logic currently sitting in `PortsSidebar.tsx`: fetching `/api/ports`, polling, tracking tunnels per port, handling `openPortTunnel`, clipboard copy feedback, pending/error states, and honoring `onAuthExpired`.
   - Ensure polling only runs while the dropdown is open (or after the first open) to avoid needless background work when the feature is unused outside worktrees.

2. **Build the dropdown component**
   - Add `PortsMenu` under `ui/src/features/ports/components/PortsMenu.tsx` using `@headlessui/react`’s `Menu` API (mirroring `TaskMenu.tsx`) and the shared `ACTION_BUTTON_CLASS`.
   - Render the Server icon button; inside the dropdown list all detected ports with controls to open/recreate tunnels, copy URLs, and surface error banners just like the sidebar did.
   - Handle empty states (“No forwarded ports detected yet”), clipboard fallbacks, loading spinners, and last-created timestamps so the feature parity with the removed sidebar is clear.

3. **Thread the component through the action bar**
   - Update `useActionBar` to accept `portsMenuNode?: React.ReactNode` (or to lazily build it via props like `onAuthExpired`) and return it unconditionally so the header can always render it; drop `isPortsSidebarOpen` / `onTogglePortsSidebar` inputs entirely.
   - Extend `RepoBrowser.tsx` to instantiate the new `PortsMenu` once (passing `notifyAuthExpired` and any telemetry/poll interval overrides) and feed it into `useActionBar`.

4. **Remove sidebar-specific state and wiring**
   - Delete the `PortsSidebar` import/rendering inside `MainPane` along with `isPortsSidebarOpen`, `onPortsSidebarClose`, and `registerMobileMenu` usages tied to it (`ui/src/features/terminal/components/MainPane.tsx:19-141`).
   - Rip out the `isPortsSidebarOpen` state, toggles, and effects from `RepoBrowser.tsx:103-873`, plus the `closePortsSidebar` dependency in `useWorktreeSelection.tsx:24-67`.
   - Remove any leftover constants (`SIDEBAR_WIDTH_STORAGE_KEY`, re-resizable sizing, etc.) that no longer apply.

5. **Inject the dropdown into every header**
   - In `MainPane`, add the `PortsMenu` node to the header button stack for the worktree view, the repo dashboard view, and the empty-state header (`ui/src/features/terminal/components/MainPane.tsx:63-219`).
   - Ensure spacing still works on mobile (may need a wrapper div or `gap-2 flex-wrap` tweak).

6. **Clean up references and documentation**
   - Delete `ui/src/features/ports/components/PortsSidebar.tsx` and remove it from any barrel files or lazy loaders.
   - Update any README or handbook snippets if they mention a “ports sidebar”.
   - Run type/lint fixes; remove dead imports (`Resizable`, `useTheme`) from files touched.

**Testing / Validation**
- `bun run lint` – confirm TypeScript + ESLint stay green after removing/adding components.
- `bun run test` – ensure backend tests (ports API) still pass since nothing server-side changed.
- `bun run --filter agentrix-ui test -- --passWithNoTests` – keep the frontend Vitest suite green.
- Manual sanity via `npm run dev:ui`: verify the dropdown lists ports, can open tunnels, copy URLs, and remains accessible in worktree, repo dashboard, and empty states; exercise auth failure handling by expiring the session.

**Risks / Edge Cases**
- Polling while the menu is closed could add unnecessary API traffic; the hook should throttle or pause polling until the dropdown opens.
- A long port list might overflow the dropdown; the component should cap height with scroll (similar to `TaskMenu`).
- Clipboard API may be unavailable in some browsers; surface a clear error string as the sidebar did.
- Removing the sidebar must not break any keyboard shortcuts or layout expectations for existing users; consider adding a short changelog entry so users know to look for the Server icon dropdown.

Let me know if you’d like any adjustments before I start implementing.
