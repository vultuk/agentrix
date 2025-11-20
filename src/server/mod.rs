use std::{
    env, fs,
    future::Future,
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::Arc,
};

use anyhow::{anyhow, Context};
use axum::{
    http::StatusCode,
    response::{Html, IntoResponse},
    routing::{get, post},
    Router,
};
use tower::{service_fn, ServiceExt};
use tower_http::services::{ServeDir, ServeFile};

pub mod handlers;
pub mod responses;
pub mod types;
pub mod worktree;

use crate::{cli::Args, Result};

#[derive(Clone)]
pub struct AppState {
    pub workdir: Arc<PathBuf>,
    pub worktrees_root: Arc<PathBuf>,
    pub frontend_root: Option<Arc<PathBuf>>,
}

pub fn router(state: AppState) -> Router {
    let api_routes = Router::new()
        .route("/", get(handlers::root))
        .route(
            "/sessions",
            get(handlers::sessions).post(handlers::clone_session),
        )
        .route(
            "/sessions/:workspace/:repository",
            post(handlers::create_worktree),
        )
        .with_state(state.clone());

    Router::new()
        .nest("/api", api_routes)
        .merge(frontend_router(state.frontend_root.clone()))
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
    let frontend_root = resolve_frontend_root();
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
        frontend_root: frontend_root.clone(),
    };

    axum::serve(listener, router(state))
        .with_graceful_shutdown(shutdown)
        .await
        .context("server task failed")
}

fn resolve_workdir(path: &Path) -> Result<PathBuf> {
    if path.exists() && !path.is_dir() {
        return Err(anyhow!("workdir {} is not a directory", path.display()));
    }

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

fn resolve_frontend_root() -> Option<Arc<PathBuf>> {
    if let Ok(path) = env::var("AGENTRIX_FRONTEND_DIR") {
        let path = PathBuf::from(path);
        if path.exists() {
            return Some(Arc::new(path));
        }

        tracing::warn!(
            target: "agentrix::server",
            path = %path.display(),
            "AGENTRIX_FRONTEND_DIR set but path does not exist; falling back to placeholder page"
        );
        return None;
    }

    let default = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("web/out");
    if default.exists() {
        Some(Arc::new(default))
    } else {
        tracing::warn!(
            target: "agentrix::server",
            path = %default.display(),
            "No built frontend found; responses on / will show a placeholder page"
        );
        None
    }
}

fn frontend_router(frontend_root: Option<Arc<PathBuf>>) -> Router {
    if let Some(root) = frontend_root {
        let index_fallback = root.join("index.html");
        let service =
            ServeDir::new(root.as_ref()).not_found_service(ServeFile::new(index_fallback));
        let service = service_fn(move |req| {
            let svc = service.clone();
            async move {
                let response = match svc.oneshot(req).await {
                    Ok(response) => response.into_response(),
                    Err(error) => (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        format!("failed to serve frontend: {error}"),
                    )
                        .into_response(),
                };

                Ok::<_, std::convert::Infallible>(response)
            }
        });

        Router::new().nest_service("/", service)
    } else {
        Router::new().route("/", get(frontend_placeholder))
    }
}

async fn frontend_placeholder() -> impl IntoResponse {
    Html(
        "<!doctype html><html><head><title>Agentrix</title></head><body><h1>Frontend not built</h1><p>Run <code>npm run build</code> in <code>web/</code> to build the Next.js app (output: export), or set <code>AGENTRIX_FRONTEND_DIR</code> to a built path.</p></body></html>",
    )
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
    use http_body_util::BodyExt;
    use std::path::Path;
    use tempfile::tempdir;
    use tower::ServiceExt;

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

    #[test]
    fn resolve_workdir_errors_when_path_is_file() {
        let tmp = tempdir().unwrap();
        let file_path = tmp.path().join("not_a_dir");
        std::fs::write(&file_path, "content").unwrap();

        let err = resolve_workdir(&file_path).unwrap_err();
        assert!(err
            .to_string()
            .contains(&format!("{} is not a directory", file_path.display())));
    }

    #[tokio::test]
    async fn serves_frontend_from_configured_directory() {
        let tmp = tempdir().unwrap();
        let frontend = tmp.path().join("frontend");
        std::fs::create_dir_all(&frontend).unwrap();
        std::fs::write(frontend.join("index.html"), "<h1>Hello Frontend</h1>").unwrap();

        let state = AppState {
            workdir: Arc::new(tmp.path().join("workdir")),
            worktrees_root: Arc::new(tmp.path().join("worktrees")),
            frontend_root: Some(Arc::new(frontend)),
        };

        let app = router(state);
        let response = app
            .oneshot(
                axum::http::Request::builder()
                    .uri("/")
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .expect("request succeeds");

        assert_eq!(response.status(), axum::http::StatusCode::OK);
        let body = BodyExt::collect(response.into_body())
            .await
            .unwrap()
            .to_bytes();
        assert!(std::str::from_utf8(&body)
            .unwrap()
            .contains("Hello Frontend"));
    }

    #[tokio::test]
    async fn placeholder_is_served_when_frontend_missing() {
        let tmp = tempdir().unwrap();
        let state = AppState {
            workdir: Arc::new(tmp.path().join("workdir")),
            worktrees_root: Arc::new(tmp.path().join("worktrees")),
            frontend_root: None,
        };

        let app = router(state);
        let response = app
            .oneshot(
                axum::http::Request::builder()
                    .uri("/")
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .expect("request succeeds");

        assert_eq!(response.status(), axum::http::StatusCode::OK);
        let body = BodyExt::collect(response.into_body())
            .await
            .unwrap()
            .to_bytes();
        assert!(std::str::from_utf8(&body)
            .unwrap()
            .contains("Frontend not built"));
    }
}
