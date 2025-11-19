use std::{
    env,
    path::{Path, PathBuf},
};

use anyhow::{anyhow, Context, Result};
use tokio::{fs, process::Command};

/// Creates a new git worktree under `worktrees_root/<workspace>/<repository>/<sanitized>`.
pub async fn create_worktree(
    repo_path: &Path,
    workspace: &str,
    repository: &str,
    branch: &str,
    worktrees_root: &Path,
) -> Result<PathBuf> {
    if branch.trim().is_empty() {
        return Err(anyhow!("branch name cannot be empty"));
    }

    let sanitized_branch = sanitize_branch_name(branch);
    let target_dir = worktrees_root
        .join(workspace)
        .join(repository)
        .join(&sanitized_branch);

    if let Some(parent) = target_dir.parent() {
        fs::create_dir_all(parent)
            .await
            .with_context(|| format!("failed to create worktree parent {}", parent.display()))?;
    }

    let output = Command::new("git")
        .arg("worktree")
        .arg("add")
        .arg("-b")
        .arg(branch)
        .arg(&target_dir)
        .current_dir(repo_path)
        .output()
        .await
        .with_context(|| format!("failed to run git worktree add in {}", repo_path.display()))?;

    if output.status.success() {
        Ok(target_dir)
    } else {
        Err(anyhow!(
            "git worktree add failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

pub fn sanitize_branch_name(input: &str) -> String {
    input
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

pub fn default_worktrees_root() -> Result<PathBuf> {
    let home = env::var("HOME").context("$HOME must be set to determine worktrees directory")?;
    Ok(PathBuf::from(home).join(".agentrix/worktrees"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command as StdCommand;
    use tempfile::tempdir;

    #[test]
    fn sanitizes_branch_names() {
        assert_eq!(sanitize_branch_name("feat/new-feature"), "feat_new-feature");
        assert_eq!(sanitize_branch_name("fix/horrible-bug"), "fix_horrible-bug");
        assert_eq!(sanitize_branch_name("weird chars!*"), "weird_chars__");
    }

    #[tokio::test]
    async fn creates_worktree_in_custom_directory() {
        let tmp = tempdir().unwrap();
        let repo_path = tmp.path().join("repo");
        fs::create_dir_all(&repo_path).await.unwrap();

        StdCommand::new("git")
            .arg("init")
            .arg(&repo_path)
            .status()
            .expect("git init succeeds");

        StdCommand::new("git")
            .args([
                "-C",
                repo_path.to_str().unwrap(),
                "config",
                "user.email",
                "test@example.com",
            ])
            .status()
            .expect("config email");
        StdCommand::new("git")
            .args([
                "-C",
                repo_path.to_str().unwrap(),
                "config",
                "user.name",
                "Agentrix",
            ])
            .status()
            .expect("config name");

        std::fs::write(repo_path.join("README.md"), "hello").unwrap();
        StdCommand::new("git")
            .args(["-C", repo_path.to_str().unwrap(), "add", "."])
            .status()
            .expect("git add");
        StdCommand::new("git")
            .args(["-C", repo_path.to_str().unwrap(), "commit", "-m", "initial"])
            .status()
            .expect("git commit");

        let worktrees_root = tmp.path().join("worktrees");

        let created = create_worktree(
            &repo_path,
            "afx-hedge-fund",
            "platform",
            "feat/new-feature",
            &worktrees_root,
        )
        .await
        .expect("worktree creation succeeds");

        assert!(created.exists());
        assert!(
            created.starts_with(worktrees_root.join("afx-hedge-fund/platform/feat_new-feature"))
        );
    }
}
