use anyhow::Context;
use clap::Parser;

pub mod cli;
pub mod commands;
pub mod error;

pub type Result<T> = anyhow::Result<T>;

/// Entry point used by the binary crate and integration tests.
pub fn run() -> Result<()> {
    init_tracing();

    let args = cli::Args::parse();
    let message = commands::execute(&args).context("failed to execute command")?;
    println!("{message}");
    Ok(())
}

fn init_tracing() {
    use std::sync::Once;
    use tracing_subscriber::{fmt, EnvFilter};

    static INIT: Once = Once::new();
    INIT.call_once(|| {
        let env_filter =
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("warn"));

        fmt()
            .with_env_filter(env_filter)
            .with_target(false)
            .with_writer(std::io::stderr)
            .init();
    });
}
