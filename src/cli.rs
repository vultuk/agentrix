use clap::Parser;

/// Command-line arguments for the Agentrix CLI.
#[derive(Debug, Parser)]
#[command(
    name = "Agentrix",
    version,
    about = "A starter command-line interface for experimenting with Rust.",
    long_about = None
)]
pub struct Args;
