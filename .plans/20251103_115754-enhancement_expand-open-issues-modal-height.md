**Goal** Let the dashboard’s “Open Issues” list expand on larger screens so desktop users aren’t stuck with a half-height scroll area.

**Analysis** The list container in `ui/src/components/RepositoryDashboard.jsx:168` is hard-capped at `max-h-[50vh]`, so even tall viewports only show half the modal, forcing an extra scrollbar. No comments contradict the proposal; we just need responsive max-height values that preserve constraints on small screens.

**Implementation Plan**
1. Review the surrounding modal layout in `ui/src/components/RepositoryDashboard.jsx` to confirm available vertical padding/margins and pick an offset that avoids overlap with header/footer content.
2. Update the “Open Issues” wrapper class list:
   - Keep the existing `max-h-[50vh]` (or similar) for base/sm breakpoints.
   - Add responsive overrides such as `lg:max-h-[75vh]` and `xl:max-h-[calc(100vh-240px)]` (or a single `lg:max-h-[calc(100vh-240px)]`) so the container scales with viewport height on desktops.
   - Ensure `overflow-y-auto` remains so the list still scrolls when needed.
3. Verify Tailwind config supports the chosen arbitrary values; adjust to compliant syntax if necessary.
4. Scan for other components reusing the same pattern; update if they rely on the same modal section to keep behaviour consistent (only if discovered during review).

**Testing / Validation**
- Run `npm run dev:ui`, open a repo dashboard, and resize the browser on a ≥1440px-tall display (or DevTools emulation) to confirm the panel grows and the nested scrollbar disappears.
- Re-check tablet/mobile breakpoints to ensure the list still fits without overflowing the viewport.
- Spot-check long issue lists for smooth scrolling and card rendering.

**Risks / Edge Cases**
- Overly aggressive `calc()` offset could let the list overlap other modal sections on moderately tall screens; adjust constants based on actual layout spacing.
- Very short viewports must still defer to the small-screen cap; confirm Tailwind breakpoints achieve the handoff cleanly.
- If other components expect the previous max height, confirm no unintended layout shifts occur.
