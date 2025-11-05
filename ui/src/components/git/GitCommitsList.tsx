import React, { Fragment } from 'react';
import { formatCount } from '../../utils/formatting.js';

interface GitCommit {
  hash: string;
  subject: string;
  author: string;
  relativeTime: string;
}

interface GitCommitsData {
  items: GitCommit[];
  total?: number;
  truncated?: boolean;
}

interface GitCommitsListProps {
  commits: GitCommitsData | null;
}

export default function GitCommitsList({ commits }: GitCommitsListProps) {
  if (!commits || commits.items.length === 0) {
    return (
      <p className="px-3 py-3 text-xs text-neutral-500">No recent commits for this branch.</p>
    );
  }

  return (
    <Fragment>
      <ul className="divide-y divide-neutral-800">
        {commits.items.map((commit) => (
          <li key={commit.hash} className="px-3 py-2 text-sm">
            <p className="text-neutral-200">
              <span className="font-semibold">{commit.subject}</span>
            </p>
            <p className="text-xs text-neutral-500">{commit.hash.slice(0, 7)} · {commit.author} · {commit.relativeTime}</p>
          </li>
        ))}
      </ul>
      {commits.truncated ? (
        <p className="px-3 pb-3 pt-2 text-[11px] text-neutral-500">
          Showing first {formatCount(commits.items.length)} of {formatCount(commits.total || 0)} commits.
        </p>
      ) : null}
    </Fragment>
  );
}

