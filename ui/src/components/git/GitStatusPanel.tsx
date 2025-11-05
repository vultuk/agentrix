import React from 'react';
import { RefreshCcw, XCircle } from 'lucide-react';
import GitSectionHeader from './GitSectionHeader.js';
import GitFileSection from './GitFileSection.js';
import GitCommitsList from './GitCommitsList.js';
import { formatTimestamp } from '../../utils/formatting.js';

type LoadState = 'idle' | 'loading' | 'error' | 'success';
type SectionKey = 'conflicts' | 'staged' | 'unstaged' | 'untracked';
type Tone = 'neutral' | 'warning' | 'danger' | 'success' | 'info';

const SECTION_CONFIG: Record<SectionKey, { title: string; emptyLabel: string; tone: Tone }> = {
  conflicts: {
    title: 'Conflicts',
    emptyLabel: 'No merge conflicts detected.',
    tone: 'danger',
  },
  staged: {
    title: 'Staged changes',
    emptyLabel: 'No staged changes.',
    tone: 'success',
  },
  unstaged: {
    title: 'Unstaged changes',
    emptyLabel: 'No unstaged changes.',
    tone: 'warning',
  },
  untracked: {
    title: 'Untracked files',
    emptyLabel: 'No untracked files.',
    tone: 'info',
  },
};

interface FileSet {
  items: unknown[];
  total: number;
  truncated?: boolean;
}

interface GitStatus {
  fetchedAt?: string;
  files?: Record<string, FileSet>;
  commits?: {
    total: number;
    items: unknown[];
  };
}

interface Sections {
  [key: string]: boolean;
}

interface GitStatusPanelProps {
  status: GitStatus | null;
  loadState: LoadState;
  error: { message?: string } | null;
  sections: Sections;
  toggleSection: (key: string) => void;
  handleFileDiffRequest: (key: string, item: unknown) => void;
  fetchStatus: (options?: { silent?: boolean }) => void;
  idPrefix?: string;
}

export default function GitStatusPanel({
  status,
  loadState,
  error,
  sections,
  toggleSection,
  handleFileDiffRequest,
  fetchStatus,
  idPrefix = '',
}: GitStatusPanelProps) {
  const lastUpdated = formatTimestamp(status?.fetchedAt);

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loadState === 'loading' && !status ? (
          <div className="space-y-3">
            <div className="h-4 animate-pulse rounded bg-neutral-800/70" />
            <div className="h-32 animate-pulse rounded bg-neutral-800/60" />
            <div className="h-24 animate-pulse rounded bg-neutral-800/60" />
          </div>
        ) : null}
        {loadState === 'error' ? (
          <div className="space-y-3 rounded-md border border-rose-500/40 bg-rose-500/10 p-4 text-rose-100">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 flex-shrink-0" />
              <div className="space-y-1 text-sm">
                <p className="font-semibold">Unable to load Git status</p>
                <p className="text-xs text-rose-100/80">{error?.message || 'Check the server logs for additional details.'}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => fetchStatus({ silent: false })}
              className="inline-flex items-center gap-2 rounded-md border border-rose-400/60 px-3 py-1 text-xs font-medium uppercase tracking-wide text-rose-50 transition hover:bg-rose-500/20"
            >
              <RefreshCcw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        ) : null}
        {status && loadState !== 'error' ? (
          <div className="space-y-4">
            {(['conflicts', 'staged', 'unstaged', 'untracked'] as const).map((key) => {
              const fileSet = status.files?.[key];
              if (!fileSet) {
                return null;
              }
              const config = SECTION_CONFIG[key];
              return (
                <section key={key} className="overflow-hidden rounded-md border border-neutral-800 bg-neutral-925/60">
                  <GitSectionHeader
                    id={`${idPrefix}${key}`}
                    title={config.title}
                    count={fileSet.total}
                    open={Boolean(sections[key])}
                    onToggle={() => toggleSection(key)}
                    tone={config.tone}
                    truncated={Boolean(fileSet.truncated)}
                  />
                  {sections[key] ? (
                    <GitFileSection
                      items={fileSet.items as never[]}
                      emptyLabel={config.emptyLabel}
                      onSelect={(item) => handleFileDiffRequest(key, item)}
                    />
                  ) : null}
                </section>
              );
            })}

            <section className="overflow-hidden rounded-md border border-neutral-800 bg-neutral-925/60">
              <GitSectionHeader
                id={`${idPrefix}commits`}
                title="Recent commits"
                count={status.commits?.total || 0}
                open={Boolean(sections.commits)}
                onToggle={() => toggleSection('commits')}
              />
              {sections.commits ? <GitCommitsList commits={status.commits || null} /> : null}
            </section>
          </div>
        ) : null}
      </div>
      <footer className="border-t border-neutral-800 px-4 py-2 text-[11px] text-neutral-500">
        {lastUpdated ? `Last updated ${lastUpdated}` : 'Awaiting first refresh…'}
      </footer>
    </>
  );
}

