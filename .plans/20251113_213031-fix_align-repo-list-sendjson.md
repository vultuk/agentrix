**Summary**
- Align `createRepoHandlers.list` so it responds via the shared `sendJson` helper, keeping headers in sync with the rest of the API surface.

**Analysis**
- The list handler in `src/api/repos.ts:14-31` manually sets status, headers, and stringifies payloads, duplicating logic already centralized in `sendJson` (`src/utils/http.ts:8-16`).  
- Any future adjustments to JSON responses (extra headers, telemetry, content negotiation) would bypass this handler, risking inconsistent behavior or missing instrumentation.  
- `sendJson` already enforces `Cache-Control: no-store`, satisfying the requirement to retain the cache override.

**Implementation Plan**
1. Update the HTTP utilities import in `src/api/repos.ts` to include `sendJson` alongside `handleHeadRequest`.  
2. Inside the `list` handler, keep the early HEAD guard (`handleHeadRequest`) untouched, but after fetching `data` call `sendJson(context.res, 200, { data })`.  
3. Remove the redundant manual `setHeader`, `statusCode`, and `res.end(JSON.stringify(...))` calls so the helper becomes the single response path.  
4. Review `src/api/repos.test.ts`:
   - Ensure the existing “list handler returns repository data” test still asserts the response body/headers (it should continue to pass because `sendJson` sets the same values).
   - Re-run the test suite to confirm no regressions for other repo handlers that already rely on the helper.

**Testing / Validation**
- `npm run test -- src/api/repos.test.ts` (or full `npm run test`) to cover the repo handlers.
- Optionally `npm run lint` if the import reorder triggers lint rules.

**Risks / Edge Cases**
- `sendJson` enforces `no-store`; if future requirements need different caching on this endpoint, we might need an override hook—document if divergence becomes necessary.
- Ensure no middleware relied on the manual `Content-Type` timing (sendJson sets it immediately, so behavioral parity should hold).
