#[tokio::main]
async fn main() {
    if let Err(err) = agentrix::run().await {
        eprintln!("Error: {err:?}");
        std::process::exit(1);
    }
}
