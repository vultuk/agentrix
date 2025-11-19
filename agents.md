# Agentrix Project Guide

## Layout
- **Binary vs library**: `src/main.rs` calls the async `agentrix::run()`, while the reusable logic resides in `src/lib.rs`.
- **Modules**: `src/cli.rs` defines Clap args (e.g., `--addr`), `src/server/mod.rs` wires the Axum router and graceful shutdown, `src/server/handlers.rs` hosts endpoint logic, and `src/server/responses.rs` centralizes JSON helpers. Each handler should bring its own unit tests.
- **Integration tests**: `tests/` uses `assert_cmd` to validate CLI UX (help/version) and will grow to full end-to-end tests as endpoints expand.

## Process
1. Add new flags/subcommands to `cli::Args` (e.g., host/port/workdir already defined).
2. Register endpoints in `src/server/mod.rs::router()` and build handlers under `src/server/handlers/`.
3. Shape payloads via `src/server/responses` helpers for consistent JSON, and return `Result` where logic might fail.
4. Log important operations via `tracing` + stdout messages (server startup must print host/port/workdir).
5. Keep code formatted (`cargo fmt`), linted (`cargo clippy -- -D warnings`), and tested (`cargo test`).

## Testing Expectations
- **Unit tests**: Each handler module includes `#[cfg(test)]` coverage (use `tower::ServiceExt` with the router for in-memory requests).
- **Integration tests**: Mirror user-visible CLI or API behavior under `tests/`; start spinning up the server/binary for full REST checks as functionality expands.
- Run `cargo fmt`, `cargo clippy --all-targets -- -D warnings`, and `cargo test --all` locally; CI enforces the same.
- Coverage: Run `cargo llvm-cov --summary-only` (requires rustup + cargo-llvm-cov) to report code coverage; CI runs this after tests.

## Documentation
- API payload references and other specs live in `docs/` (e.g., `docs/sessions.md` for the `/sessions` endpoint). Review these before changing types or responses.
