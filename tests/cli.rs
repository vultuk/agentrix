use assert_cmd::cargo::cargo_bin_cmd;
use predicates::prelude::*;

#[test]
fn help_describes_server_usage() {
    cargo_bin_cmd!("agentrix")
        .arg("--help")
        .assert()
        .success()
        .stdout(
            predicate::str::contains(
                "A starter command-line interface for experimenting with Rust.",
            )
            .and(predicate::str::contains("--host <HOST>"))
            .and(predicate::str::contains("--port <PORT>"))
            .and(predicate::str::contains("--workdir <PATH>"))
            .and(predicate::str::contains("default: 0.0.0.0"))
            .and(predicate::str::contains("default: 4567"))
            .and(predicate::str::contains("default: .")),
        )
        .stderr(predicate::str::is_empty());
}

#[test]
fn version_flag_prints_version() {
    cargo_bin_cmd!("agentrix")
        .arg("--version")
        .assert()
        .success()
        .stdout(predicate::str::contains(env!("CARGO_PKG_VERSION")))
        .stderr(predicate::str::is_empty());
}
