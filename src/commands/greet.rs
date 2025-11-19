use crate::cli::Args;
use crate::error::CommandResult;

pub const GREETING: &str = "Hello, world!";

/// Returns the greeting message for the provided arguments.
pub fn message(_args: &Args) -> CommandResult<&'static str> {
    Ok(GREETING)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_default_greeting() {
        let args = Args;
        let message = message(&args).expect("greeting succeeds");
        assert_eq!(message, GREETING);
    }
}
