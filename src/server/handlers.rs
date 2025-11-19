use axum::{extract::State, Json};
use serde::Serialize;

use crate::server::{
    responses::{success, ApiResponse},
    types::{workspaces_from_dir, SessionWorkspace},
    AppState,
};

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

#[cfg(test)]
mod tests {
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use http_body_util::BodyExt;
    use std::{fs, sync::Arc};
    use tempfile::tempdir;
    use tower::ServiceExt;

    #[tokio::test]
    async fn returns_hello_world_payload() {
        let tmp = tempdir().unwrap();
        let app = crate::server::router(crate::server::AppState {
            workdir: Arc::new(tmp.path().to_path_buf()),
        });
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

        let app = crate::server::router(crate::server::AppState {
            workdir: Arc::new(tmp.path().to_path_buf()),
        });
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
}
