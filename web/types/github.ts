export type RepoSummary = {
  open_issues_count: number;
  open_prs_count: number;
  issues: GitHubIssue[];
  pull_requests: GitHubPull[];
};

export type GitHubIssue = {
  number: number;
  title: string;
  html_url: string;
  labels: string[];
  assignee?: GitHubUser;
};

export type GitHubPull = {
  number: number;
  title: string;
  html_url: string;
  labels: string[];
  user: GitHubUser;
};

export type GitHubUser = {
  login: string;
  avatar_url?: string;
};

export type IssueDetail = GitHubIssue & {
  body: string;
  state: string;
  user: GitHubUser;
};

export type PullDetail = GitHubPull & {
  body: string;
  state: string;
};
