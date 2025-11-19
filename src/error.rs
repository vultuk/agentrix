use thiserror::Error;

pub type CommandResult<T> = Result<T, AgentrixError>;

#[derive(Debug, Error)]
pub enum AgentrixError {
    #[error("greeting is currently unavailable")]
    GreetingUnavailable,
}
