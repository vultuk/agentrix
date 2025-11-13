**Summary**
- Prevent repository identifiers from escaping the configured workdir by hardening the URL parsing and subsequent filesystem operations.

**Analysis**
- The vulnerability stems from `parseRepositoryUrl` handing unvalidated `org`/`repo` segments (e.g., `../etc/passwd.git`) into `ensureRepository`/`cloneRepository`, which then blindly `path.join` registers under `workdir`.
- A malicious repo URL successfully resolves to directories outside the sandbox, so clone/remove actions can touch arbitrary files.
- There are no comments, but the issue specifies rejection of traversal tokens and enforcement that every derived path remains inside `workdir`.

**Implementation Plan**
1. Extend `parseRepositoryUrl` (`src/domain/git-url-parser.ts`) to reject `org`/`repo` segments containing `.`, `..`, or path separators before returning them.
2. In the repository service (`src/repositories/repository-repository.ts`), after computing the intended repo root (e.g., via `path.join(workdir, org, repo)`), run `path.resolve` and verify `path.relative(workdir, repoRoot)` doesn’t start with `..` to guard clone/delete operations.
3. Ensure any helper that constructs repo paths applies the same validation so we don’t accidentally reuse unsafe logic elsewhere.
4. Add tests for evil URLs, checking that requests to `POST /api/repos` (and relevant cleanup endpoints) respond with `400` before any directory creation, covering both parser validation and path validation guards.

**Testing/Validation**
- Unit tests for `parseRepositoryUrl` rejecting traversal segments.
- Unit/integration tests for repository create/delete endpoints returning `400` for evil URLs, ensuring no directories are created.
- Run existing relevant test suites (`npm run test`, etc.) to verify nothing else regressed.

**Potential Risks / Edge Cases**
- Legitimate repository names containing dots (like `repo.v1`) must still be allowed; validation needs to distinguish between normal names and traversal tokens (`.` or `..` as entire segments or embedded path separators).
- Other entry points that derive repo paths must also honor the new guard; missing one could leave a blind spot.
- Tests must avoid creating actual sensitive paths while demonstrating rejection.
