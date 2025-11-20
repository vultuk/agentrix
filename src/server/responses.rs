use axum::{http::StatusCode, Json};
use serde::Serialize;

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct ApiResponse<T> {
    pub data: T,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct ApiError {
    pub message: String,
}

pub fn success<T>(data: T) -> Json<ApiResponse<T>>
where
    T: Serialize,
{
    Json(ApiResponse { data })
}

pub fn error(status: StatusCode, message: impl Into<String>) -> (StatusCode, Json<ApiError>) {
    (
        status,
        Json(ApiError {
            message: message.into(),
        }),
    )
}
