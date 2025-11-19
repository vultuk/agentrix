use std::{io::ErrorKind, path::Path};

use anyhow::{anyhow, Context};
use axum::{
    extract::{Path as AxumPath, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use tokio::{fs, process::Command};

use crate::server::{
    responses::{error, success, ApiError, ApiResponse},
    types::{workspaces_from_dir, SessionWorkspace},
    worktree, AppState,
};

type HandlerResult<T> = Result<Json<ApiResponse<T>>, (StatusCode, Json<ApiError>)>;

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct GreetingResponse {
    pub message: &'static str,
}

pub async fn root() -> Json<ApiResponse<GreetingResponse>> {
    success(GreetingResponse {
        message: "Hello, world!",
    })
}

pub async fn sessions(State(state): State<AppState>) -> Json<ApiResponse<Vec<SessionWorkspace>>> {
    let workspaces = workspaces_from_dir(state.workdir.as_ref()).unwrap_or_else(|err| {
        tracing::error!(target: "agentrix::server", error = %err, "failed to read sessions");
        Vec::new()
    });

    success(workspaces)
}

#[derive(Debug, Deserialize)]
pub struct CloneSessionRequest {
    pub repository_url: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct CloneSessionResponse {
    pub workspace: String,
    pub repository: String,
    pub path: String,
}

pub async fn clone_session(
    State(state): State<AppState>,
    Json(payload): Json<CloneSessionRequest>,
) -> HandlerResult<CloneSessionResponse> {
    let repo = parse_repository_url(&payload.repository_url)
        .map_err(|err| error(StatusCode::BAD_REQUEST, err))?;

    let target_dir = state.workdir.join(&repo.workspace).join(&repo.repository);

    match fs::metadata(&target_dir).await {
        Ok(_) => {
            return Err(error(
                StatusCode::CONFLICT,
                format!("repository already exists at {}", target_dir.display()),
            ))
        }
        Err(err) if err.kind() != ErrorKind::NotFound => {
            tracing::error!(
                target: "agentrix::server",
                error = %err,
                path = %target_dir.display(),
                "failed to inspect repository directory"
            );
            return Err(error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to inspect repository directory",
            ));
        }
        _ => {}
    }

    if let Some(parent) = target_dir.parent() {
        fs::create_dir_all(parent).await.map_err(|err| {
            tracing::error!(
                target: "agentrix::server",
                error = %err,
                path = %parent.display(),
                "failed to create workspace directory"
            );
            error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to prepare workspace directory",
            )
        })?;
    }

    if let Err(err) = run_git_clone(&payload.repository_url, &target_dir).await {
        tracing::error!(
            target: "agentrix::server",
            error = %err,
            repository = %payload.repository_url,
            path = %target_dir.display(),
            "git clone failed"
        );
        let _ = fs::remove_dir_all(&target_dir).await;
        return Err(error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to clone repository",
        ));
    }

    Ok(success(CloneSessionResponse {
        workspace: repo.workspace,
        repository: repo.repository,
        path: target_dir.to_string_lossy().into_owned(),
    }))
}

#[derive(Debug, Deserialize)]
pub struct CreateWorktreeRequest {
    pub branch: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct CreateWorktreeResponse {
    pub workspace: String,
    pub repository: String,
    pub branch: String,
    pub path: String,
}

pub async fn create_worktree(
    AxumPath((workspace, repository)): AxumPath<(String, String)>,
    State(state): State<AppState>,
    Json(payload): Json<CreateWorktreeRequest>,
) -> HandlerResult<CreateWorktreeResponse> {
    if payload.branch.trim().is_empty() {
        return Err(error(
            StatusCode::BAD_REQUEST,
            "branch name cannot be empty",
        ));
    }

    let repo_path = state.workdir.join(&workspace).join(&repository);
    if !repo_path.exists() {
        return Err(error(
            StatusCode::NOT_FOUND,
            format!(
                "repository {}/{} does not exist in workdir",
                workspace, repository
            ),
        ));
    }

    match worktree::create_worktree(
        &repo_path,
        &workspace,
        &repository,
        &payload.branch,
        state.worktrees_root.as_ref().as_path(),
    )
    .await
    {
        Ok(path) => Ok(success(CreateWorktreeResponse {
            workspace: workspace.clone(),
            repository: repository.clone(),
            branch: payload.branch,
            path: path.to_string_lossy().into_owned(),
        })),
        Err(err) => {
            tracing::error!(
                target: "agentrix::server",
                error = %err,
                workspace = %workspace,
                repository = %repository,
                branch = %payload.branch,
                "failed to create worktree"
            );
            Err(error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to create worktree",
            ))
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct RepoCoordinates {
    workspace: String,
    repository: String,
}

fn parse_repository_url(raw: &str) -> Result<RepoCoordinates, String> {
    let trimmed = raw.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("repository_url cannot be empty".into());
    }

    if trimmed.starts_with("git@") {
        let mut parts = trimmed.splitn(2, ':');
        let _ = parts.next();
        let path = parts
            .next()
            .ok_or_else(|| "invalid SSH repository URL".to_string())?;
        return coordinates_from_path(path);
    }

    let path = if let Some(idx) = trimmed.find("://") {
        let after_protocol = &trimmed[idx + 3..];
        let slash_index = after_protocol
            .find('/')
            .ok_or_else(|| "repository URL must include workspace and repository".to_string())?;
        &after_protocol[slash_index + 1..]
    } else {
        trimmed
    };

    coordinates_from_path(path)
}

fn coordinates_from_path(path: &str) -> Result<RepoCoordinates, String> {
    let segments: Vec<&str> = path
        .split('/')
        .filter(|segment| !segment.trim().is_empty())
        .collect();

    if segments.len() < 2 {
        return Err("repository URL must include workspace and repository".into());
    }

    let repo_segment = segments
        .last()
        .ok_or_else(|| "repository URL is missing repository name".to_string())?;
    let workspace_segment = segments[segments.len() - 2];

    let repository = repo_segment.trim_end_matches(".git").to_string();
    if repository.is_empty() {
        return Err("repository name cannot be empty".into());
    }

    Ok(RepoCoordinates {
        workspace: workspace_segment.to_string(),
        repository,
    })
}

async fn run_git_clone(repo_url: &str, target_dir: &Path) -> anyhow::Result<()> {
    let output = Command::new("git")
        .arg("clone")
        .arg(repo_url)
        .arg(target_dir)
        .output()
        .await
        .with_context(|| format!("failed to invoke git clone for {repo_url}"))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(anyhow!(
            "git clone exited with status {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

#[cfg(test)]
mod tests {
    use axum::{
        body::Body,
        extract::State,
        http::{Request, StatusCode},
        Json,
    };
    use http_body_util::BodyExt;
    use serde_json::json;
    use std::{fs, path::Path, process::Command as StdCommand, sync::Arc};
    use tempfile::tempdir;
    use tower::ServiceExt;

    #[tokio::test]
    async fn returns_hello_world_payload() {
        let tmp = tempdir().unwrap();
        let app = crate::server::router(test_state(tmp.path()));
        let response = app
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .expect("request succeeds");

        assert_eq!(response.status(), StatusCode::OK);

        let bytes = response
            .into_body()
            .collect()
            .await
            .expect("read body")
            .to_bytes();
        let payload: serde_json::Value = serde_json::from_slice(&bytes).expect("valid json");

        assert_eq!(payload["data"]["message"], "Hello, world!");
    }

    #[tokio::test]
    async fn returns_sessions_payload() {
        let tmp = tempdir().unwrap();
        fs::create_dir_all(tmp.path().join("vultuk/simonskinner_me")).unwrap();

        let app = crate::server::router(test_state(tmp.path()));
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/sessions")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .expect("request succeeds");

        assert_eq!(response.status(), StatusCode::OK);

        let bytes = response
            .into_body()
            .collect()
            .await
            .expect("read body")
            .to_bytes();
        let payload: serde_json::Value = serde_json::from_slice(&bytes).expect("valid json");

        assert_eq!(payload["data"][0]["name"], "vultuk");
        assert_eq!(
            payload["data"][0]["repositories"][0]["name"],
            "simonskinner_me"
        );
        assert!(payload["data"][0]["repositories"][0]["plans"]
            .as_array()
            .unwrap()
            .is_empty());
        assert!(payload["data"][0]["repositories"][0]["worktrees"]
            .as_array()
            .unwrap()
            .is_empty());
    }

    #[tokio::test]
    async fn clone_session_clones_repository_from_file_url() {
        let tmp = tempdir().unwrap();
        let remote = tmp.path().join("afx-hedge-fund/platform.git");
        fs::create_dir_all(remote.parent().unwrap()).unwrap();
        let status = StdCommand::new("git")
            .arg("init")
            .arg("--bare")
            .arg(&remote)
            .status()
            .expect("initialize bare repo");
        assert!(status.success());

        let workdir = tmp.path().join("workdir");
        fs::create_dir_all(&workdir).unwrap();

        let state = crate::server::AppState {
            workdir: Arc::new(workdir.clone()),
            worktrees_root: Arc::new(workdir.join("worktrees")),
        };
        let payload = super::CloneSessionRequest {
            repository_url: format!("file://{}", remote.display()),
        };

        let response = super::clone_session(State(state), Json(payload))
            .await
            .expect("clone succeeds");
        let Json(api_response) = response;
        assert_eq!(api_response.data.workspace, "afx-hedge-fund");
        assert_eq!(api_response.data.repository, "platform");
        assert!(workdir.join("afx-hedge-fund/platform").exists());
    }

    #[test]
    fn parses_https_repository_url() {
        let repo = super::parse_repository_url("https://github.com/afx-hedge-fund/platform.git")
            .expect("valid url");
        assert_eq!(repo.workspace, "afx-hedge-fund");
        assert_eq!(repo.repository, "platform");
    }

    #[test]
    fn parses_ssh_repository_url() {
        let repo =
            super::parse_repository_url("git@github.com:afx-hedge-fund/platform.git").unwrap();
        assert_eq!(repo.workspace, "afx-hedge-fund");
        assert_eq!(repo.repository, "platform");
    }

    #[test]
    fn rejects_invalid_repository_url() {
        let err = super::parse_repository_url("https://github.com/invalid").unwrap_err();
        assert!(
            err.contains("workspace"),
            "expected workspace/repository error"
        );
    }

    #[tokio::test]
    async fn create_worktree_endpoint_creates_worktree() {
        let tmp = tempdir().unwrap();
        let workdir = tmp.path().join("workdir");
        fs::create_dir_all(&workdir).unwrap();

        let repo_path = workdir.join("afx-hedge-fund/platform");
        init_git_repo(&repo_path);

        let worktrees_root = tmp.path().join("worktrees");
        let state = state_with_root(&workdir, &worktrees_root);
        let app = crate::server::router(state);

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/sessions/afx-hedge-fund/platform")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({ "branch": "feat/new-feature" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .expect("request succeeds");

        assert_eq!(response.status(), StatusCode::OK);

        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let payload: serde_json::Value = serde_json::from_slice(&bytes).expect("valid json");
        let path = payload["data"]["path"].as_str().unwrap();
        assert!(Path::new(path).exists());
        assert!(path.contains("feat_new-feature"));
    }

    #[tokio::test]
    async fn create_worktree_errors_when_repo_missing() {
        let tmp = tempdir().unwrap();
        let workdir = tmp.path().join("workdir");
        fs::create_dir_all(&workdir).unwrap();

        let app = crate::server::router(test_state(&workdir));

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/sessions/afx-hedge-fund/platform")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{ "branch": "feat/does-not-exist" }"#))
                    .unwrap(),
            )
            .await
            .expect("request succeeds");

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    fn init_git_repo(path: &Path) {
        fs::create_dir_all(path).unwrap();
        StdCommand::new("git")
            .arg("init")
            .arg(path)
            .status()
            .expect("git init succeeds");
        StdCommand::new("git")
            .args([
                "-C",
                path.to_str().unwrap(),
                "config",
                "user.email",
                "test@example.com",
            ])
            .status()
            .expect("config email");
        StdCommand::new("git")
            .args([
                "-C",
                path.to_str().unwrap(),
                "config",
                "user.name",
                "Agentrix",
            ])
            .status()
            .expect("config name");
        std::fs::write(path.join("README.md"), "hello").unwrap();
        StdCommand::new("git")
            .args(["-C", path.to_str().unwrap(), "add", "."])
            .status()
            .expect("git add");
        StdCommand::new("git")
            .args(["-C", path.to_str().unwrap(), "commit", "-m", "init"])
            .status()
            .expect("git commit");
    }

    fn test_state(workdir: &Path) -> crate::server::AppState {
        crate::server::AppState {
            workdir: Arc::new(workdir.to_path_buf()),
            worktrees_root: Arc::new(workdir.join("worktrees")),
        }
    }

    fn state_with_root(workdir: &Path, worktrees_root: &Path) -> crate::server::AppState {
        crate::server::AppState {
            workdir: Arc::new(workdir.to_path_buf()),
            worktrees_root: Arc::new(worktrees_root.to_path_buf()),
        }
    }
}
