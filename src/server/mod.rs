use std::{
    env, fs,
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::Arc,
};

use anyhow::Context;
use axum::{routing::get, Router};

pub mod handlers;
pub mod responses;
pub mod types;

use crate::{cli::Args, Result};

#[derive(Clone)]
pub struct AppState {
    pub workdir: Arc<PathBuf>,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/", get(handlers::root))
        .route("/sessions", get(handlers::sessions))
        .with_state(state)
}

pub async fn run(args: &Args) -> Result<()> {
    let workdir = resolve_workdir(&args.workdir)?;
    env::set_current_dir(&workdir).context("failed to switch to workdir")?;

    let addr = args.addr();
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .context("failed to bind to address")?;
    let actual_addr = listener
        .local_addr()
        .context("failed to read bound address")?;

    display_startup(&actual_addr, &workdir);

    let state = AppState {
        workdir: Arc::new(workdir.clone()),
    };

    axum::serve(listener, router(state))
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("server task failed")
}

fn resolve_workdir(path: &Path) -> Result<PathBuf> {
    if !path.exists() {
        fs::create_dir_all(path)
            .with_context(|| format!("failed to create workdir {}", path.display()))?;
    }

    fs::canonicalize(path).with_context(|| format!("failed to resolve workdir {}", path.display()))
}

fn display_startup(addr: &SocketAddr, workdir: &Path) {
    let message = format_startup_message(addr, workdir);
    println!("{message}");

    tracing::info!(
        target: "agentrix::server",
        host = %addr.ip(),
        port = addr.port(),
        workdir = %workdir.display(),
        "Server starting"
    );
}

fn format_startup_message(addr: &SocketAddr, workdir: &Path) -> String {
    format!(
        "Agentrix server listening on http://{}:{} (workdir: {})",
        addr.ip(),
        addr.port(),
        workdir.display()
    )
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install CTRL+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn formats_startup_message() {
        let addr = SocketAddr::from(([127, 0, 0, 1], 4567));
        let message = format_startup_message(&addr, Path::new("/tmp"));

        assert_eq!(
            message,
            "Agentrix server listening on http://127.0.0.1:4567 (workdir: /tmp)"
        );
    }
}
