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

pub fn workspaces_from_dir(workdir: &Path) -> Result<Vec<SessionWorkspace>> {
    if !workdir.exists() {
        return Ok(vec![]);
    }

    let mut workspaces = Vec::new();
    for entry in fs::read_dir(workdir)
        .with_context(|| format!("failed to read workdir {}", workdir.display()))?
    {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }

        let org_name = entry.file_name().to_string_lossy().into_owned();
        let repos = repositories_from_dir(entry.path())?;
        workspaces.push(SessionWorkspace {
            name: org_name,
            repositories: repos,
        });
    }

    Ok(workspaces)
}

fn repositories_from_dir(org_path: PathBuf) -> Result<Vec<SessionRepository>> {
    let mut repositories = Vec::new();

    for entry in fs::read_dir(&org_path)
        .with_context(|| format!("failed to read org directory {}", org_path.display()))?
    {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }

        let repo = SessionRepository {
            name: entry.file_name().to_string_lossy().into_owned(),
            plans: Vec::new(),
            worktrees: Vec::new(),
        };
        repositories.push(repo);
    }

    Ok(repositories)
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

        let workspaces = workspaces_from_dir(tmp.path()).unwrap();
        assert_eq!(workspaces.len(), 1);
        assert_eq!(workspaces[0].name, "vultuk");
        assert_eq!(workspaces[0].repositories.len(), 1);
        assert_eq!(workspaces[0].repositories[0].name, "simonskinner_me");
    }

    #[test]
    fn workspaces_from_dir_handles_missing_path() {
        let tmp = tempdir().unwrap();
        let missing = tmp.path().join("does_not_exist");

        let workspaces = workspaces_from_dir(&missing).unwrap();
        assert!(workspaces.is_empty());
    }

    #[test]
    fn repositories_skip_non_directory_entries() {
        let tmp = tempdir().unwrap();
        let org_path = tmp.path().join("vultuk");
        fs::create_dir_all(&org_path).unwrap();
        fs::write(org_path.join("README.md"), "docs").unwrap();
        fs::create_dir_all(org_path.join("repo_a")).unwrap();

        let repos = repositories_from_dir(org_path).unwrap();
        assert_eq!(repos.len(), 1);
        assert_eq!(repos[0].name, "repo_a");
    }
}
