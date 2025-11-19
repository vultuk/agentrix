use axum::Json;
use serde::Serialize;

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct ApiResponse<T> {
    pub data: T,
}

pub fn success<T>(data: T) -> Json<ApiResponse<T>>
where
    T: Serialize,
{
    Json(ApiResponse { data })
}
