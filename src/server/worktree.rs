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
    let branch = branch.trim();
    if branch.is_empty() {
        return Err(anyhow!("branch name cannot be empty"));
    }

    if !repo_path.join(".git").exists() {
        return Err(anyhow!("{} is not a git repository", repo_path.display()));
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
        .trim()
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

    struct EnvVarGuard {
        key: &'static str,
        original: Option<String>,
    }

    impl EnvVarGuard {
        fn set(key: &'static str, value: &str) -> Self {
            let original = env::var(key).ok();
            env::set_var(key, value);
            Self { key, original }
        }

        fn clear(key: &'static str) -> Self {
            let original = env::var(key).ok();
            env::remove_var(key);
            Self { key, original }
        }
    }

    impl Drop for EnvVarGuard {
        fn drop(&mut self) {
            match &self.original {
                Some(value) => env::set_var(self.key, value),
                None => env::remove_var(self.key),
            }
        }
    }

    #[test]
    fn sanitizes_branch_names() {
        assert_eq!(sanitize_branch_name("feat/new-feature"), "feat_new-feature");
        assert_eq!(sanitize_branch_name("fix/horrible-bug"), "fix_horrible-bug");
        assert_eq!(sanitize_branch_name("weird chars!*"), "weird_chars__");
        assert_eq!(sanitize_branch_name("  spaced "), "spaced");
    }

    #[tokio::test]
    async fn rejects_empty_branch_names() {
        let tmp = tempdir().unwrap();
        let repo_path = tmp.path().join("repo");
        fs::create_dir_all(&repo_path).await.unwrap();

        let err = create_worktree(&repo_path, "workspace", "repository", "   ", tmp.path())
            .await
            .unwrap_err();

        assert!(err.to_string().contains("branch name cannot be empty"));
    }

    #[tokio::test]
    async fn errors_when_repo_is_not_git_repo() {
        let tmp = tempdir().unwrap();
        let repo_path = tmp.path().join("repo");
        fs::create_dir_all(&repo_path).await.unwrap();

        let err = create_worktree(
            &repo_path,
            "workspace",
            "repository",
            "feature/one",
            tmp.path(),
        )
        .await
        .unwrap_err();

        assert!(err
            .to_string()
            .contains(&format!("{} is not a git repository", repo_path.display())));
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

    #[test]
    fn default_worktrees_root_uses_home_environment_variable() {
        let tmp = tempdir().unwrap();
        let _guard = EnvVarGuard::set("HOME", tmp.path().to_str().unwrap());

        let root = default_worktrees_root().expect("root can be computed");
        assert_eq!(root, tmp.path().join(".agentrix/worktrees"));
    }

    #[test]
    fn default_worktrees_root_errors_when_home_missing() {
        let _guard = EnvVarGuard::clear("HOME");
        let err = default_worktrees_root().unwrap_err();
        assert!(err.to_string().contains("$HOME must be set"));
    }
}
