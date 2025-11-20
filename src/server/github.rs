use anyhow::{anyhow, Context, Result};
use reqwest::{header, Client};
use serde::Deserialize;
use std::sync::Arc;

#[derive(Clone)]
pub struct GitHubClient {
    token: Option<Arc<String>>,
    http: Client,
}

impl GitHubClient {
    pub fn from_token(token: Option<String>) -> Result<Option<Self>> {
        if token.is_none() {
            return Ok(None);
        }

        let client = Client::builder()
            .user_agent("agentrix/0.1")
            .build()
            .context("failed to build GitHub client")?;

        Ok(Some(Self {
            token: token.map(Arc::new),
            http: client,
        }))
    }

    pub async fn repo_summary(&self, owner: &str, repo: &str) -> Result<RepoSummary> {
        let issues = self.list_open_issues(owner, repo).await?;
        let pulls = self.list_open_pulls(owner, repo).await?;

        Ok(RepoSummary {
            open_issues_count: issues.len() as u32,
            open_prs_count: pulls.len() as u32,
            issues,
            pull_requests: pulls,
        })
    }

    async fn list_open_issues(&self, owner: &str, repo: &str) -> Result<Vec<IssueSummary>> {
        let url = format!(
            "https://api.github.com/repos/{owner}/{repo}/issues?state=open&per_page=100&sort=updated&direction=desc"
        );
        let resp = self
            .http
            .get(url)
            .headers(self.auth_headers())
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(anyhow!(
                "GitHub issues fetch failed with status {}",
                resp.status()
            ));
        }

        let items: Vec<IssueItem> = resp.json().await.context("failed to parse issues")?;
        let issues: Vec<IssueSummary> = items
            .into_iter()
            .filter(|item| item.pull_request.is_none())
            .map(|item| IssueSummary {
                number: item.number,
                title: item.title,
                html_url: item.html_url,
                labels: item.labels.into_iter().map(|l| l.name).collect(),
                assignee: item.assignee.map(|u| Assignee {
                    login: u.login,
                    avatar_url: u.avatar_url,
                }),
            })
            .collect();

        Ok(issues)
    }

    async fn list_open_pulls(&self, owner: &str, repo: &str) -> Result<Vec<PullSummary>> {
        let url = format!(
            "https://api.github.com/repos/{owner}/{repo}/pulls?state=open&per_page=100&sort=updated&direction=desc"
        );
        let resp = self
            .http
            .get(url)
            .headers(self.auth_headers())
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(anyhow!(
                "GitHub pulls fetch failed with status {}",
                resp.status()
            ));
        }

        let items: Vec<PullItem> = resp.json().await.context("failed to parse pulls")?;
        Ok(items
            .into_iter()
            .map(|item| PullSummary {
                number: item.number,
                title: item.title,
                html_url: item.html_url,
                labels: item.labels.into_iter().map(|l| l.name).collect(),
                user: Assignee {
                    login: item.user.login,
                    avatar_url: item.user.avatar_url,
                },
            })
            .collect())
    }

    fn auth_headers(&self) -> header::HeaderMap {
        let mut headers = header::HeaderMap::new();
        if let Some(token) = &self.token {
            headers.insert(
                header::AUTHORIZATION,
                header::HeaderValue::from_str(&format!("Bearer {token}"))
                    .unwrap_or_else(|_| header::HeaderValue::from_static("")),
            );
        }
        headers
    }

    pub async fn issue_detail(&self, owner: &str, repo: &str, number: u32) -> Result<IssueDetail> {
        let url = format!("https://api.github.com/repos/{owner}/{repo}/issues/{number}");
        let resp = self
            .http
            .get(url)
            .headers(self.auth_headers())
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(anyhow!(
                "GitHub issue fetch failed with status {}",
                resp.status()
            ));
        }

        let item: IssueDetailItem = resp.json().await.context("failed to parse issue detail")?;

        Ok(IssueDetail {
            number: item.number,
            title: item.title,
            body: item.body.unwrap_or_default(),
            html_url: item.html_url,
            labels: item.labels.into_iter().map(|l| l.name).collect(),
            assignee: item.assignee.map(|u| Assignee {
                login: u.login,
                avatar_url: u.avatar_url,
            }),
            user: Assignee {
                login: item.user.login,
                avatar_url: item.user.avatar_url,
            },
            state: item.state,
        })
    }

    pub async fn pull_detail(&self, owner: &str, repo: &str, number: u32) -> Result<PullDetail> {
        let url = format!("https://api.github.com/repos/{owner}/{repo}/pulls/{number}");
        let resp = self
            .http
            .get(url)
            .headers(self.auth_headers())
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(anyhow!(
                "GitHub pull fetch failed with status {}",
                resp.status()
            ));
        }

        let item: PullDetailItem = resp.json().await.context("failed to parse pull detail")?;

        Ok(PullDetail {
            number: item.number,
            title: item.title,
            body: item.body.unwrap_or_default(),
            html_url: item.html_url,
            labels: item.labels.into_iter().map(|l| l.name).collect(),
            user: Assignee {
                login: item.user.login,
                avatar_url: item.user.avatar_url,
            },
            state: item.state,
        })
    }
}

#[derive(Deserialize)]
struct Label {
    name: String,
}

#[derive(Deserialize)]
struct User {
    login: String,
    avatar_url: Option<String>,
}

#[derive(Deserialize)]
struct IssueItem {
    number: u32,
    title: String,
    html_url: String,
    labels: Vec<Label>,
    assignee: Option<User>,
    #[serde(default)]
    pull_request: Option<PullRequestMarker>,
}

#[derive(Deserialize)]
struct PullRequestMarker {}

#[derive(Deserialize)]
struct PullItem {
    number: u32,
    title: String,
    html_url: String,
    user: User,
    labels: Vec<Label>,
}

#[derive(Deserialize)]
struct IssueDetailItem {
    number: u32,
    title: String,
    body: Option<String>,
    html_url: String,
    labels: Vec<Label>,
    assignee: Option<User>,
    user: User,
    state: String,
}

#[derive(Deserialize)]
struct PullDetailItem {
    number: u32,
    title: String,
    body: Option<String>,
    html_url: String,
    labels: Vec<Label>,
    user: User,
    state: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct RepoSummary {
    pub open_issues_count: u32,
    pub open_prs_count: u32,
    pub issues: Vec<IssueSummary>,
    pub pull_requests: Vec<PullSummary>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct IssueSummary {
    pub number: u32,
    pub title: String,
    pub html_url: String,
    pub labels: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee: Option<Assignee>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PullSummary {
    pub number: u32,
    pub title: String,
    pub html_url: String,
    pub labels: Vec<String>,
    pub user: Assignee,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct IssueDetail {
    pub number: u32,
    pub title: String,
    pub body: String,
    pub html_url: String,
    pub labels: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee: Option<Assignee>,
    pub user: Assignee,
    pub state: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PullDetail {
    pub number: u32,
    pub title: String,
    pub body: String,
    pub html_url: String,
    pub labels: Vec<String>,
    pub user: Assignee,
    pub state: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct Assignee {
    pub login: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
}
