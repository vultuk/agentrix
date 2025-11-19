use std::net::SocketAddr;

use anyhow::Context;
use axum::{routing::get, Router};

pub mod handlers;
pub mod responses;

use crate::Result;

pub fn router() -> Router {
    Router::new().route("/", get(handlers::root))
}

pub async fn run(addr: SocketAddr) -> Result<()> {
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .context("failed to bind to address")?;
    let actual_addr = listener
        .local_addr()
        .context("failed to read bound address")?;

    tracing::info!(target: "agentrix::server", %actual_addr, "Server starting");

    axum::serve(listener, router())
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("server task failed")
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
