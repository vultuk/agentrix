use assert_cmd::cargo::cargo_bin_cmd;
use predicates::prelude::*;

#[test]
fn prints_greeting_by_default() {
    cargo_bin_cmd!("agentrix")
        .assert()
        .success()
        .stdout(predicate::str::contains("Hello, world!"))
        .stderr(predicate::str::is_empty());
}

#[test]
fn prints_help_text_when_requested() {
    cargo_bin_cmd!("agentrix")
        .arg("--help")
        .assert()
        .success()
        .stdout(
            predicate::str::contains("Usage: agentrix")
                .and(predicate::str::contains("-h, --help"))
                .and(predicate::str::contains("-V, --version"))
                .and(predicate::str::contains(
                    "A starter command-line interface for experimenting with Rust.",
                )),
        )
        .stderr(predicate::str::is_empty());
}
