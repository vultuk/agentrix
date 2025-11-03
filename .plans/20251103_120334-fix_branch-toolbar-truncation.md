**Resolution Plan**

- Summary: Keep the desktop toolbar actions visible by truncating long branch names and adding a tooltip for the full value.
- Analysis: The branch name text in `ui/src/App.jsx` lives in a flex row without width constraints, so long names expand indefinitely and push the action buttons off-screen; we need a bounded container with truncation and a way to show the full string (likely a tooltip) while preserving existing styling for short names and ensuring mobile layout stays intact.
- Implementation Plan: 
  1. Inspect the toolbar JSX in `ui/src/App.jsx` (current branch/render section) to understand the layout and identify the branch-name span/div. 
  2. Wrap the branch label with a flex child that has `min-w-0` and `truncate` (and likely `overflow-hidden whitespace-nowrap`) so it shrinks before the action icons; ensure the surrounding flex container still aligns items correctly. 
  3. Add a tooltip for the full branch name (`title` attribute or existing tooltip helper) and ensure it works for keyboard focus; consider splitting repo path to its own smaller line if needed to give the action row more room. 
  4. Adjust responsive classes so desktop retains single-line actions and mobile/hamburger remains unaffected; update any CSS or Tailwind utilities as necessary. 
  5. Run lint/format if the project requires after JSX updates.
- Testing / Validation: Run `npm run dev:ui` and manually shrink the desktop viewport to ~1100px (and below) using a long branch name to confirm truncation + tooltip and verify no regressions for short names; optionally run `npm run build` to ensure UI build succeeds.
- Potential Risks / Edge Cases: Tooltip approach must be accessible (keyboard focus, screen readers); truncation must not hide critical icons on very small screens (ensure existing responsive breakpoints handle this); layout changes shouldn’t break the mobile drawer or introduce double truncation if repo path also long.
