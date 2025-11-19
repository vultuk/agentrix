# Agentrix Project Guide

## Layout
- **Binary vs library**: `src/main.rs` calls `agentrix::run()`, and all logic lives in `src/lib.rs` + modules.
- **Modules**: `src/cli.rs` defines Clap args, `src/commands/` hosts command handlers (each with unit tests), `src/error.rs` centralizes structured errors.
- **Integration tests**: Lives in `tests/`, using `assert_cmd` to run the compiled binary.

## Process
1. Add new flags/subcommands to `cli::Args`.
2. Implement behavior in a dedicated `src/commands/<name>.rs` module and register it in `commands/mod.rs`.
3. Return `CommandResult<T>` with clear `AgentrixError`s; extend the enum when needed.
4. Log important operations via `tracing` macros; stderr is already wired for logs.
5. Keep code formatted (`cargo fmt`), linted (`cargo clippy -- -D warnings`), and tested (`cargo test`).

## Testing Expectations
- **Unit tests**: Every command module includes at least one `#[cfg(test)]` section covering primary branches.
- **Integration tests**: For each user-visible change, add/extend tests under `tests/` to assert CLI output/exit codes.
- Run `cargo fmt`, `cargo clippy --all-targets -- -D warnings`, and `cargo test --all` locally; CI enforces the same.
