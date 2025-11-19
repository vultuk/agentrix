use axum::Json;
use serde::Serialize;

use crate::server::responses::{success, ApiResponse};

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct GreetingResponse {
    pub message: &'static str,
}

pub async fn root() -> Json<ApiResponse<GreetingResponse>> {
    success(GreetingResponse {
        message: "Hello, world!",
    })
}

#[cfg(test)]
mod tests {
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    #[tokio::test]
    async fn returns_hello_world_payload() {
        let app = crate::server::router();
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
}
