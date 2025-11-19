pub mod greet;

use crate::cli::Args;
use crate::error::CommandResult;

/// Dispatches execution to the appropriate command handler.
pub fn execute(args: &Args) -> CommandResult<&'static str> {
    greet::message(args)
}
