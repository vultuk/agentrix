**Summary**
- Serve the SSE initial `REPOS_UPDATE` snapshot from the cached repository map produced by `refreshRepositoryCache`, falling back to `discoverRepositories` only before the cache exists.

**Analysis**
- `sendInitialSnapshots` currently reruns the expensive `discoverRepositories` scan on every SSE connection despite ongoing calls to `refreshRepositoryCache` (which also emits cache data via the event bus).  
- The cache module already discovers once per refresh but doesn’t expose the snapshot, so SSE has no access to existing data.  
- Restoring a cached snapshot reduces client latency and avoids redundant filesystem/git work while still allowing the first connection to populate the cache.

**Implementation Plan**
1. Extend `src/utils/repository-cache.ts` to store the most recent `RepositoriesMap`, export a `getRepositoryCacheSnapshot()` helper, and reset/inspect that cache for tests (e.g., via a new `__setRepositoryCacheSnapshot()` utility). Ensure `refreshRepositoryCache` updates the cached snapshot before emitting.  
2. Update `src/server/events.ts` so `sendInitialSnapshots` reads `getRepositoryCacheSnapshot()` first and only calls `discoverRepositories(workdir)` when the cache is `null`, applying the existing error handling/fallback to `{}`.  
3. Enhance `src/utils/repository-cache.test.ts` to assert the snapshot is stored and reset between tests, and add a new test (and/or utility) covering the getter.  
4. Add a backend test (in `src/server/events.test.ts`) that seeds the cache, verifies the SSE handler reuses it, and ensures `discoverRepositories` is not invoked when cached data exists while preserving the fallback path.

**Testing/Validation**
- `npm run test -- src/utils/repository-cache.test.ts`  
- `npm run test -- src/server/events.test.ts`  

**Potential Risks / Edge Cases**
- If `refreshRepositoryCache` fails (e.g., permissions), the cache remains `null` and SSE still needs to fallback to `discoverRepositories`, so the fallback logic must remain intact.  
- Cached data could become stale between refreshes if the refresh interval is long, but SSE already resubscribes to `REPOS_UPDATE` events, so clients will eventually see updates once another refresh runs.  
- Tests must reset the new cache state to avoid bleed between cases.

Please confirm before I start modifying the code.
