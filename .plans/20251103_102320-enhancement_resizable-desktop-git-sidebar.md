**Summary**
- Make the desktop Git status sidebar resizable with a persisted width so wide screens can show longer filenames without sacrificing terminal usability.

**Analysis**
- `ui/src/components/GitStatusSidebar.jsx:373` hard-codes `desktopWidth` to 360 px whenever the panel is open, leaving no room for larger layouts.
- The sidebar sits beside the terminal pane in `ui/src/App.jsx:3538-3553`, so expanding its width directly shrinks the terminal; we must clamp the sidebar to leave a sensible minimum terminal width.
- Acceptance criteria call for width persistence and a “reasonable” terminal minimum but don’t specify the exact pixel target—will assume ~500 px unless stakeholders prefer a different value.

**Implementation Plan**
1. In `ui/src/components/GitStatusSidebar.jsx`, introduce state for `sidebarWidth` with an initializer that reads a `localStorage` key when `window` is available, falling back to the current 360 px default.
2. Replace the fixed-width `<div>` with a `Resizable` wrapper (importing from `re-resizable`) that:
   - Enables dragging on the left edge only when `isOpen` is true;
   - Uses `size={{ width: isOpen ? sidebarWidth : 0, height: '100%' }}`;
   - Applies `minWidth` (~320 px) and a computed `maxWidth` that reserves at least ~500 px for the terminal (e.g., `Math.min(720, window.innerWidth - 500)` guarded for SSR).
3. Update resize handlers so dragging updates state with clamped values and persist the new width to `localStorage` inside a guarded `useEffect`; skip persistence while closed so reopening keeps the last saved value.
4. Add a lightweight visual handle (e.g., an absolutely-positioned 10 px drag strip with cursor styling) inside the sidebar so users see where to grab, and ensure existing transition/pointer-event logic still hides the panel cleanly when closed.
5. Verify mobile behaviour: keep the existing full-screen drawer path untouched (`lg:hidden` branch) and ensure the resizable wrapper only renders on large screens. Adjust responsive classes if needed so the handle does not appear on mobile.

**Testing/Validation**
- Run `npm run dev:ui`, open the git status panel on a ≥1280 px viewport, and confirm the sidebar can be widened and narrowed smoothly while the terminal never drops below the chosen minimum width.
- Reload the page to verify the width persists.
- Toggle the panel closed/open and ensure it reopens at the saved width.
- Spot-check mobile mode to confirm behaviour is unchanged.

**Potential Risks / Edge Cases**
- Miscomputing `maxWidth` could still allow the sidebar to starve the terminal; confirm the clamp logic under very wide and moderately wide screens.
- `localStorage` access must remain guarded to avoid SSR/runtime errors when `window` is unavailable.
- Transition styling might conflict with `Resizable`’s inline width updates; be ready to adjust or drop the width transition if it causes jitter.
