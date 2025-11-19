fn main() {
    if let Err(err) = agentrix::run() {
        eprintln!("Error: {err:?}");
        std::process::exit(1);
    }
}
