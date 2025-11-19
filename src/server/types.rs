use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use serde::Serialize;

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct SessionWorkspace {
    pub name: String,
    pub repositories: Vec<SessionRepository>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct SessionRepository {
    pub name: String,
    pub plans: Vec<SessionPlan>,
    pub worktrees: Vec<SessionWorktree>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct SessionPlan {
    pub name: String,
    pub session_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub related_issue: Option<u32>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct SessionWorktree {
    pub name: String,
    pub terminals: Vec<SessionTerminal>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct SessionTerminal {
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dangerous: Option<bool>,
    pub session_id: String,
}

pub fn workspaces_from_dir(workdir: &Path, worktrees_root: &Path) -> Result<Vec<SessionWorkspace>> {
    if !workdir.exists() {
        return Ok(vec![]);
    }

    let mut workspaces = Vec::new();
    let mut orgs = Vec::new();
    for entry in fs::read_dir(workdir)
        .with_context(|| format!("failed to read workdir {}", workdir.display()))?
    {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }

        orgs.push((
            entry.file_name().to_string_lossy().into_owned(),
            entry.path(),
        ));
    }

    orgs.sort_by(|a, b| a.0.cmp(&b.0));

    for (org_name, org_path) in orgs {
        let repos = repositories_from_dir(&org_name, org_path, worktrees_root)?;
        workspaces.push(SessionWorkspace {
            name: org_name,
            repositories: repos,
        });
    }

    Ok(workspaces)
}

fn repositories_from_dir(
    org_name: &str,
    org_path: PathBuf,
    worktrees_root: &Path,
) -> Result<Vec<SessionRepository>> {
    let mut repositories = Vec::new();
    let mut names = Vec::new();

    for entry in fs::read_dir(&org_path)
        .with_context(|| format!("failed to read org directory {}", org_path.display()))?
    {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }

        names.push(entry.file_name().to_string_lossy().into_owned());
    }

    names.sort();

    for name in names {
        repositories.push(SessionRepository {
            name: name.clone(),
            plans: Vec::new(),
            worktrees: worktrees_for_repo(worktrees_root, org_name, &name)?,
        });
    }

    Ok(repositories)
}

fn worktrees_for_repo(
    worktrees_root: &Path,
    workspace: &str,
    repository: &str,
) -> Result<Vec<SessionWorktree>> {
    let repo_root = worktrees_root.join(workspace).join(repository);
    if !repo_root.exists() {
        return Ok(vec![]);
    }

    let mut worktrees = Vec::new();
    for entry in fs::read_dir(&repo_root)
        .with_context(|| format!("failed to read worktrees directory {}", repo_root.display()))?
    {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }

        worktrees.push(SessionWorktree {
            name: entry.file_name().to_string_lossy().into_owned(),
            terminals: Vec::new(),
        });
    }

    worktrees.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(worktrees)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn builds_workspaces_from_directory_structure() {
        let tmp = tempdir().unwrap();
        let org_path = tmp.path().join("vultuk");
        let repo_path = org_path.join("simonskinner_me");
        fs::create_dir_all(repo_path).unwrap();

        let workspaces = workspaces_from_dir(tmp.path(), tmp.path()).unwrap();
        assert_eq!(workspaces.len(), 1);
        assert_eq!(workspaces[0].name, "vultuk");
        assert_eq!(workspaces[0].repositories.len(), 1);
        assert_eq!(workspaces[0].repositories[0].name, "simonskinner_me");
    }

    #[test]
    fn workspaces_from_dir_handles_missing_path() {
        let tmp = tempdir().unwrap();
        let missing = tmp.path().join("does_not_exist");

        let workspaces = workspaces_from_dir(&missing, tmp.path()).unwrap();
        assert!(workspaces.is_empty());
    }

    #[test]
    fn repositories_skip_non_directory_entries() {
        let tmp = tempdir().unwrap();
        let org_path = tmp.path().join("vultuk");
        fs::create_dir_all(&org_path).unwrap();
        fs::write(org_path.join("README.md"), "docs").unwrap();
        fs::create_dir_all(org_path.join("repo_a")).unwrap();

        let repos = repositories_from_dir("vultuk", org_path, tmp.path()).unwrap();
        assert_eq!(repos.len(), 1);
        assert_eq!(repos[0].name, "repo_a");
    }

    #[test]
    fn workspaces_are_sorted_alphabetically() {
        let tmp = tempdir().unwrap();
        let org_b = tmp.path().join("z_workspace");
        let org_a = tmp.path().join("a_workspace");
        fs::create_dir_all(org_b.join("repo_one")).unwrap();
        fs::create_dir_all(org_a.join("repo_two")).unwrap();

        let workspaces = workspaces_from_dir(tmp.path(), tmp.path()).unwrap();
        assert_eq!(workspaces[0].name, "a_workspace");
        assert_eq!(workspaces[1].name, "z_workspace");
    }

    #[test]
    fn repositories_are_sorted_alphabetically() {
        let tmp = tempdir().unwrap();
        let org_path = tmp.path().join("org");
        fs::create_dir_all(&org_path).unwrap();
        fs::create_dir_all(org_path.join("b_repo")).unwrap();
        fs::create_dir_all(org_path.join("a_repo")).unwrap();

        let repos = repositories_from_dir("org", org_path, tmp.path()).unwrap();
        assert_eq!(repos[0].name, "a_repo");
        assert_eq!(repos[1].name, "b_repo");
    }

    #[test]
    fn discovers_worktrees_from_agentrix_root() {
        let tmp = tempdir().unwrap();
        let workdir = tmp.path().join("workdir");
        let org_path = workdir.join("org");
        let repo_path = org_path.join("repo");
        fs::create_dir_all(&repo_path).unwrap();

        let worktrees_root = tmp.path().join("worktrees");
        let repo_worktrees = worktrees_root.join("org/repo");
        fs::create_dir_all(repo_worktrees.join("feat_one")).unwrap();
        fs::create_dir_all(repo_worktrees.join("feat_two")).unwrap();
        fs::write(repo_worktrees.join("README.txt"), "not a dir").unwrap();

        let workspaces = workspaces_from_dir(&workdir, &worktrees_root).unwrap();
        assert_eq!(workspaces.len(), 1);
        let repo = &workspaces[0].repositories[0];
        assert_eq!(repo.worktrees.len(), 2);
        assert_eq!(repo.worktrees[0].name, "feat_one");
        assert_eq!(repo.worktrees[1].name, "feat_two");
    }

    #[test]
    fn missing_worktrees_root_is_treated_as_empty() {
        let tmp = tempdir().unwrap();
        let workdir = tmp.path().join("workdir");
        let org_path = workdir.join("org");
        let repo_path = org_path.join("repo");
        fs::create_dir_all(&repo_path).unwrap();

        let worktrees_root = tmp.path().join("worktrees");
        let workspaces = workspaces_from_dir(&workdir, &worktrees_root).unwrap();
        assert_eq!(workspaces[0].repositories[0].worktrees.len(), 0);
    }
}
