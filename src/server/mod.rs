use std::{
    env, fs,
    future::Future,
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::Arc,
};

use anyhow::Context;
use axum::{
    routing::{get, post},
    Router,
};

pub mod handlers;
pub mod responses;
pub mod types;
pub mod worktree;

use crate::{cli::Args, Result};

#[derive(Clone)]
pub struct AppState {
    pub workdir: Arc<PathBuf>,
    pub worktrees_root: Arc<PathBuf>,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/", get(handlers::root))
        .route(
            "/sessions",
            get(handlers::sessions).post(handlers::clone_session),
        )
        .route(
            "/sessions/:workspace/:repository",
            post(handlers::create_worktree),
        )
        .with_state(state)
}

pub async fn run(args: &Args) -> Result<()> {
    run_with_shutdown(args, shutdown_signal()).await
}

pub async fn run_with_shutdown<F>(args: &Args, shutdown: F) -> Result<()>
where
    F: Future<Output = ()> + Send + 'static,
{
    let workdir = resolve_workdir(&args.workdir)?;
    let worktrees_root = worktree::default_worktrees_root()?;
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
        worktrees_root: Arc::new(worktrees_root),
    };

    axum::serve(listener, router(state))
        .with_graceful_shutdown(shutdown)
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
    use tempfile::tempdir;

    #[test]
    fn formats_startup_message() {
        let addr = SocketAddr::from(([127, 0, 0, 1], 4567));
        let message = format_startup_message(&addr, Path::new("/tmp"));

        assert_eq!(
            message,
            "Agentrix server listening on http://127.0.0.1:4567 (workdir: /tmp)"
        );
    }

    #[test]
    fn resolve_workdir_creates_missing_directory() {
        let tmp = tempdir().unwrap();
        let missing = tmp.path().join("org/new_repo");
        assert!(!missing.exists());

        let resolved = resolve_workdir(&missing).unwrap();
        assert_eq!(resolved, missing.canonicalize().unwrap());
        assert!(missing.exists());
    }

    #[test]
    fn resolve_workdir_returns_existing_directory() {
        let tmp = tempdir().unwrap();
        let existing = tmp.path();
        let resolved = resolve_workdir(existing).unwrap();
        assert_eq!(resolved, existing.canonicalize().unwrap());
    }
}
