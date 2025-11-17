import React, { useMemo, useState } from 'react';
import { renderMarkdown } from '../../../utils/markdown.js';
import CodexSdkChatPanel from '../../codex-sdk/components/CodexSdkChatPanel.js';
import type { PlanDetail } from '../../../types/plan-mode.js';
import type { CodexSdkEvent, CodexSdkSessionMetadata } from '../../../types/codex-sdk.js';

const { createElement: h } = React;

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected';

interface PlanWorkspaceProps {
  plan: PlanDetail | null;
  isLoading: boolean;
  error: string | null;
  chatState: {
    events: CodexSdkEvent[];
    isSending: boolean;
    connectionState: ConnectionState;
    session: CodexSdkSessionMetadata | null;
    lastError: string | null;
    onSend: (text: string) => Promise<void>;
  };
  onSave: (markdown: string) => Promise<void>;
  onMarkReady: () => Promise<void>;
  onBuild: () => Promise<void>;
  isBuildPending: boolean;
  onDeletePlan: () => void;
}

function StatusBadge({ status }: { status: PlanDetail['status'] }) {
  const map: Record<PlanDetail['status'], string> = {
    draft: 'bg-neutral-800 text-neutral-200 border-neutral-700',
    updated: 'bg-amber-500/10 text-amber-300 border-amber-500/60',
    ready: 'bg-emerald-500/10 text-emerald-300 border-emerald-400/60',
    building: 'bg-blue-500/10 text-blue-200 border-blue-400/50',
  };
  const label = status === 'ready' ? 'Ready to Build' : status.charAt(0).toUpperCase() + status.slice(1);
  return h(
    'span',
    {
      className: `inline-flex items-center rounded-full border px-2 py-[2px] text-xs font-medium ${map[status]}`,
    },
    label,
  );
}

function buildDiffPreview(plan: PlanDetail | null): string {
  if (!plan?.lastChange) {
    return '';
  }
  const lines: string[] = [];
  plan.lastChange.hunks.forEach((hunk) => {
    hunk.lines.forEach((line) => {
      const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
      lines.push(`${prefix} ${line.text}`.trimEnd());
    });
  });
  return lines.slice(0, 40).join('\n');
}

export default function PlanWorkspace({
  plan,
  isLoading,
  error,
  chatState,
  onSave,
  onMarkReady,
  onBuild,
  isBuildPending,
  onDeletePlan,
}: PlanWorkspaceProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [activePane, setActivePane] = useState<'plan' | 'chat'>('plan');
  const diffPreview = buildDiffPreview(plan);

  const content = useMemo(() => {
    if (!plan) {
      return '';
    }
    return renderMarkdown(plan.markdown || '');
  }, [plan?.markdown]);

  const handleStartEdit = () => {
    if (!plan) {
      return;
    }
    setDraft(plan.markdown);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setDraft('');
  };

  const handleSave = async () => {
    if (!plan) {
      return;
    }
    setIsSaving(true);
    try {
      await onSave(draft);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return h(
      'div',
      { className: 'flex flex-1 flex-col items-center justify-center text-sm text-neutral-400' },
      'Loading plan…',
    );
  }

  if (error) {
    return h(
      'div',
      { className: 'flex flex-1 flex-col items-center justify-center text-sm text-rose-300' },
      error,
    );
  }

  if (!plan) {
    return null;
  }

  const disableBuild = plan.status !== 'ready' || isBuildPending;
  const planPaneClasses = [
    'flex-1 min-h-0 rounded-lg border border-neutral-800 bg-neutral-925/80 p-4',
    'flex flex-col gap-3',
    activePane === 'plan' ? '' : 'hidden',
    'lg:flex',
  ].join(' ');
  const chatPaneClasses = [
    'flex-1 min-h-[320px] rounded-lg border border-neutral-800 bg-neutral-925/70 p-2',
    'flex flex-col',
    activePane === 'chat' ? '' : 'hidden',
    'lg:flex',
  ].join(' ');

  return h(
    'div',
    { className: 'flex flex-1 min-h-0 flex-col gap-4' },
    h(
      'div',
      { className: 'flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-3' },
      h(
        'div',
        null,
        h(
          'div',
          { className: 'text-xs text-neutral-500' },
          `${plan.source.type === 'issue' ? 'Issue-linked plan' : 'Plan draft'}`,
        ),
        h('h2', { className: 'text-xl font-semibold text-neutral-100' }, plan.title),
      ),
      h(
        'div',
        { className: 'flex flex-wrap items-center gap-2' },
        h(StatusBadge, { status: plan.status }),
        diffPreview
          ? h(
              'div',
              { className: 'relative group inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-500/10 px-2 py-[2px] text-[11px] text-amber-100' },
              h('span', null, plan.lastChange?.updatedBy === 'codex' ? 'Codex updated plan' : 'Plan updated'),
              h(
                'div',
                {
                  className:
                    'pointer-events-none absolute left-0 top-full z-10 mt-1 hidden min-w-[220px] group-hover:block',
                },
                h(
                  'div',
                  {
                    className:
                      'rounded-md border border-amber-500/40 bg-neutral-950/95 px-3 py-2 text-left text-[11px] text-amber-50 shadow-lg',
                  },
                  h(
                    'div',
                    { className: 'mb-1 text-[10px] uppercase tracking-wide text-amber-200/80' },
                    'Recent changes',
                  ),
                  h(
                    'pre',
                    { className: 'max-h-48 overflow-auto whitespace-pre-wrap text-[11px]' },
                    diffPreview,
                  ),
                ),
              ),
            )
          : null,
        plan.source.type === 'issue' && plan.source.issueUrl
          ? h(
              'a',
              {
                href: plan.source.issueUrl,
                target: '_blank',
                rel: 'noopener noreferrer',
                className:
                  'inline-flex items-center rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:text-emerald-300 transition',
              },
              `Issue #${plan.source.issueNumber ?? ''}`.trim(),
            )
          : null,
        h(
          'button',
          {
            type: 'button',
            onClick: onDeletePlan,
            className:
              'inline-flex items-center rounded-md border border-rose-500/60 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/10 transition',
          },
          'Close',
        ),
      ),
    ),
    h(
      'div',
      { className: 'lg:hidden flex items-center rounded-md border border-neutral-800 bg-neutral-950/60 text-xs text-neutral-300' },
      h(
        'button',
        {
          type: 'button',
          onClick: () => setActivePane('plan'),
          className: [
            'flex-1 py-2 text-center transition',
            activePane === 'plan' ? 'bg-emerald-500/20 text-emerald-100' : '',
          ].join(' '),
        },
        'Plan',
      ),
      h(
        'button',
        {
          type: 'button',
          onClick: () => setActivePane('chat'),
          className: [
            'flex-1 py-2 text-center transition',
            activePane === 'chat' ? 'bg-emerald-500/20 text-emerald-100' : '',
          ].join(' '),
        },
        'Chat',
      ),
    ),
    h(
      'div',
      { className: 'flex flex-1 flex-col gap-4 lg:flex-row lg:gap-6 min-h-0' },
      h(
        'div',
        { className: planPaneClasses },
        h(
          'div',
          { className: 'flex flex-wrap items-center gap-2' },
          h(
            'button',
            {
              type: 'button',
              onClick: isEditing ? handleCancelEdit : handleStartEdit,
              className:
                'inline-flex items-center rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:text-emerald-300 transition',
            },
            isEditing ? 'Cancel' : 'Edit Plan',
          ),
          isEditing
            ? h(
                'button',
                {
                  type: 'button',
                  onClick: handleSave,
                  disabled: isSaving,
                  className:
                    'inline-flex items-center rounded-md border border-emerald-600 bg-emerald-500/80 px-3 py-1 text-xs font-semibold text-neutral-950 transition disabled:opacity-50',
                },
                isSaving ? 'Saving…' : 'Save',
              )
            : null,
          plan.status !== 'ready'
            ? h(
                'button',
                {
                  type: 'button',
                  onClick: onMarkReady,
                  className:
                    'inline-flex items-center rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:text-emerald-300 transition',
                },
                'Mark Ready',
              )
            : null,
          h(
            'button',
            {
              type: 'button',
              onClick: onBuild,
              disabled: disableBuild,
              className:
                'inline-flex items-center rounded-md border border-emerald-600 bg-emerald-500/80 px-3 py-1 text-xs font-semibold text-neutral-950 transition disabled:opacity-50',
            },
            isBuildPending ? 'Building…' : `Build ${plan.slug}`,
          ),
        ),
        isEditing
          ? h('textarea', {
              className:
                'min-h-[240px] flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-emerald-500 focus:outline-none',
              value: draft,
              onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(event.target.value),
            })
          : h('div', {
              className: 'plan-markdown markdown-preview__content prose-invert text-sm text-neutral-100 flex-1 overflow-y-auto min-h-0',
              dangerouslySetInnerHTML: { __html: content || '<p class="text-neutral-500">Plan is empty.</p>' },
            }),
      ),
      h(
        'div',
        { className: chatPaneClasses },
        h(CodexSdkChatPanel, {
          events: chatState.events,
          isSending: chatState.isSending,
          connectionState: chatState.connectionState,
          session: chatState.session,
          lastError: chatState.lastError,
          onSend: chatState.onSend,
        }),
      ),
    ),
  );
}
