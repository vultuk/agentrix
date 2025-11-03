**Summary**  
Adjust the repository dashboard grid so tablet widths render three metric cards per row while preserving existing layouts for mobile and desktop.

**Analysis**  
- Current grid classes at `ui/src/components/RepositoryDashboard.jsx:107` are `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`, leaving tablets (≥768px) locked at two columns.  
- Tailwind’s `md` breakpoint aligns with the requested tablet range, so adding `md:grid-cols-3` should fill the spare space without affecting other breakpoints.  
- Gap sizing (`gap-3`) is 12 px; acceptance criteria mention maintaining 16 px gutters, so we may need to bump this to `gap-4` or introduce responsive gaps after checking card padding.  
- No comments or linked issues add constraints; change is isolated to the dashboard metrics grid.

**Implementation Plan**  
1. Update the grid container in `ui/src/components/RepositoryDashboard.jsx:107` to include `md:grid-cols-3`, keeping existing mobile (`grid-cols-1`) and desktop (`lg:grid-cols-4`) settings.  
2. Review the surrounding layout classes for metric cards (same file, nearby lines) to ensure card padding plus grid gap yields a 16 px gutter; adjust to `gap-4` or responsive gap classes if needed.  
3. Confirm that any card-specific width/min-width utilities remain compatible with three columns; tweak card-level classes if they introduce wrapping or overflow at `md` widths.  
4. Run the Tailwind build (`npm run build` or `npm run dev:ui`) to ensure the new classes compile and the UI serves correctly.

**Testing / Validation**  
- Launch `npm run dev:ui`, load the dashboard, and inspect in responsive mode at widths around 768–1023 px to confirm three columns and stable gutters.  
- Check <640 px and ≥1024 px breakpoints to ensure single- and four-column layouts remain unchanged.  
- Spot-check metric card contents for wrapping or truncation after spacing changes.

**Potential Risks / Edge Cases**  
- Increasing the gap could reduce available width, triggering unintended wrapping; verify before finalizing.  
- If metric cards have fixed widths or min-heights, the third column might cause overflow on the smallest tablet widths.  
- Tailwind class purge is already configured, but confirm new responsive utility is referenced directly so it isn’t tree-shaken.
