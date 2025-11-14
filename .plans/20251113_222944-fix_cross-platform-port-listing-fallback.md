**Summary**
- The CLI’s `listActivePorts` currently shells to a Linux-only `ss` pipeline, so the Ports UI fails on macOS and Windows. We need per-platform fallbacks so every supported OS can enumerate listening TCP ports while keeping the existing numeric parsing.

**Analysis**
- `src/core/ports.ts:24-82` executes a hard-coded `ss` command with `/bin/sh`. That command doesn’t exist on macOS or Windows, so execution rejects and errors bubble to the UI (“Failed to list active ports”). The rest of the file works cross-platform. No alternate commands are tried, and the dependency bundle offers no way to override the detected platform, making it hard to test non-Linux behavior. Acceptance criteria emphasize: keep Linux path, add macOS/Windows fallbacks, and add tests stubbing `execCommand` + platform to verify success.

**Implementation Plan**
1. **Platform-Aware Command Resolver**
   - Add a pure helper (e.g., `resolvePortListCommand(platform: NodeJS.Platform)`) inside `src/core/ports.ts` that returns both the command string and shell (if needed). Map:
     - `linux`/`android`: existing `ss -ntlpH | ...` with `/bin/sh`.
     - `darwin`: `lsof -nP -iTCP -sTCP:LISTEN | awk 'NR>1 {print $9}' | awk -F ':' '{print $NF}' | sort -n | uniq` executed via `/bin/sh`.
     - `win32`: run `powershell.exe -NoLogo -NoProfile -Command "Get-NetTCPConnection -State Listen | Select-Object -ExpandProperty LocalPort | Sort-Object -Unique"`.
   - Return `null` when no supported command exists so the caller can throw a friendlier error.

2. **Inject Platform Dependency**
   - Extend `PortsDependencies` with `platform: NodeJS.Platform` (default `process.platform`). Update `__setPortsTestOverrides` and `defaultDependencies` accordingly so tests can force `'darwin'`/`'win32'`.

3. **Update `listActivePorts`**
   - Before executing, call the command resolver using `activeDependencies.platform`. If unsupported, throw a descriptive error (“Port listing not supported on <platform>”). Otherwise, call `execCommand` with the returned command and shell (only override shell on Unix; let Windows default to `cmd.exe` while the command itself invokes PowerShell).
   - Keep the numeric parsing logic unchanged.

4. **Tests**
   - Extend `src/core/ports.test.ts`:
     - Existing Linux-focused tests continue to pass.
     - Add cases overriding `platform: 'darwin'`/`'win32'` and injecting `execCommand` mocks to assert (a) `listActivePorts` consumes fallback output successfully, (b) the right command string is passed, and (c) errors mention unsupported platforms when resolver returns `null`.
   - Ensure tests override `execCommand` to avoid running real system commands, fulfilling the acceptance requirement.

**Testing / Validation**
- Run `npm run test -- src/core/ports.test.ts` (or full test suite if required) to cover new paths.
- Optionally run `npm run lint` / `npm run typecheck` to satisfy repo guardrails after code changes.

**Potential Risks / Edge Cases**
- PowerShell command availability on older Windows or PowerShell Core paths—guard with meaningful error messages if `powershell.exe` is absent.
- `lsof` might be missing on some macOS hosts; document/handle by surfacing the underlying failure to guide users.
- Locale/format differences in output; keeping the pipeline constrained to output only ports mitigates parser changes, but double-check quoting to avoid shell injection issues.
- Ensure command detection gracefully handles other Unix variants (e.g., `freebsd`) possibly by returning an explicit unsupported error rather than falling back to Linux commands that may fail silently.

Let me know when you’re ready for implementation or if you’d like clarifications first.
