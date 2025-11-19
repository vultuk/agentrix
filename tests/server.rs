use agentrix::cli::Args;
use serde_json::Value;
use std::{
    net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener},
    time::{Duration, Instant},
};
use tempfile::tempdir;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
    sync::oneshot,
    time::sleep,
};

fn find_available_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .expect("bind temp port")
        .local_addr()
        .expect("read addr")
        .port()
}

async fn wait_for_server(addr: SocketAddr) {
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        match TcpStream::connect(addr).await {
            Ok(stream) => {
                drop(stream);
                return;
            }
            Err(error) if Instant::now() < deadline => {
                tracing::debug!(%addr, %error, "retrying server connection");
                sleep(Duration::from_millis(50)).await;
            }
            Err(error) => panic!("server at {addr} did not start: {error}"),
        }
    }
}

#[tokio::test]
async fn run_with_shutdown_serves_requests() {
    let tmp = tempdir().unwrap();
    let port = find_available_port();
    let args = Args {
        host: IpAddr::V4(Ipv4Addr::LOCALHOST),
        port,
        workdir: tmp.path().to_path_buf(),
    };

    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let server_args = args.clone();

    let server_handle = tokio::spawn(async move {
        agentrix::server::run_with_shutdown(&server_args, async {
            let _ = shutdown_rx.await;
        })
        .await
        .expect("server should run");
    });

    let addr = args.addr();
    wait_for_server(addr).await;

    let body = http_get(addr, "/").await.expect("request should succeed");
    assert_eq!(body["data"]["message"], "Hello, world!");

    shutdown_tx.send(()).expect("able to signal shutdown");
    server_handle
        .await
        .expect("server task should finish without panic");
}

async fn http_get(addr: SocketAddr, path: &str) -> anyhow::Result<Value> {
    let mut stream = TcpStream::connect(addr).await?;
    let request = format!(
        "GET {} HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n",
        path, addr
    );
    stream.write_all(request.as_bytes()).await?;

    let mut buffer = Vec::new();
    stream.read_to_end(&mut buffer).await?;
    let response = String::from_utf8_lossy(&buffer);

    let mut parts = response.split("\r\n\r\n");
    let status_line = parts.next().unwrap_or("");
    anyhow::ensure!(
        status_line.starts_with("HTTP/1.1 200"),
        "unexpected response: {status_line}"
    );

    let body = parts.next().unwrap_or("");
    Ok(serde_json::from_str(body)?)
}
