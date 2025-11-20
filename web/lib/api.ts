import { ApiResponse, SessionWorkspace } from "../types/sessions";
import { RepoSummary } from "../types/github";
import { IssueDetail, PullDetail } from "../types/github";

async function parseJson<T>(res: Response): Promise<T | { message?: string }> {
  try {
    return (await res.json()) as T;
  } catch {
    return {};
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  const json = await parseJson<ApiResponse<T>>(res);
  if (!res.ok) {
    const message = (json as { message?: string }).message;
    throw new Error(message || `Request failed: ${res.status}`);
  }

  if (!json || !("data" in json)) {
    throw new Error("Malformed response from server");
  }

  return json.data;
}

export async function getSessions(signal?: AbortSignal): Promise<SessionWorkspace[]> {
  const res = await fetch("/api/sessions", { signal });
  return handleResponse<SessionWorkspace[]>(res);
}

export async function cloneSession(repositoryUrl: string): Promise<{
  workspace: string;
  repository: string;
  path: string;
}> {
  const res = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repository_url: repositoryUrl }),
  });
  return handleResponse(res);
}

export async function createWorktree(
  workspace: string,
  repo: string,
  branch: string
): Promise<{
  workspace: string;
  repository: string;
  branch: string;
  path: string;
}> {
  const res = await fetch(`/api/sessions/${workspace}/${repo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branch }),
  });
  return handleResponse(res);
}

export async function getRepoSummary(owner: string, repo: string): Promise<RepoSummary> {
  const res = await fetch(`/api/repos/${owner}/${repo}/summary`);
  return handleResponse(res);
}

export async function getIssueDetail(
  owner: string,
  repo: string,
  number: number
): Promise<IssueDetail> {
  const res = await fetch(`/api/repos/${owner}/${repo}/issues/${number}`);
  return handleResponse(res);
}

export async function getPullDetail(
  owner: string,
  repo: string,
  number: number
): Promise<PullDetail> {
  const res = await fetch(`/api/repos/${owner}/${repo}/pulls/${number}`);
  return handleResponse(res);
}
