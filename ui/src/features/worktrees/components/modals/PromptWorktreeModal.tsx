import React, { Fragment, useMemo } from 'react';
import Modal from '../../../../components/Modal.js';
import ModalFooter from '../../../../components/ModalFooter.js';
import TextArea from '../../../../components/TextArea.js';
import Label from '../../../../components/Label.js';
import LoadingButton from '../../../../components/LoadingButton.js';
import { renderSpinner } from '../../../../components/Spinner.js';
import { renderMarkdown } from '../../../../utils/markdown.js';
import { PROMPT_AGENT_OPTIONS } from '../../../../config/commands.js';
import { PROMPT_EDITOR_TABS } from '../../../../utils/constants.js';

const { createElement: h } = React;

interface PromptWorktreeModalProps {
  isOpen: boolean;
  repoName: string;
  promptText: string;
  promptAgent: string;
  promptDangerousMode: boolean;
  promptInputMode: string;
  isCreating: boolean;
  isCreatingPlan: boolean;
  isLaunchOptionDisabled: boolean;
  showDangerousModeOption: boolean;
  onClose: () => void;
  onPromptTextChange: (value: string) => void;
  onPromptAgentChange: (value: string) => void;
  onPromptDangerousModeChange: (value: boolean) => void;
  onPromptInputModeChange: (value: string) => void;
  onCreatePlan: () => void;
  onSubmit: () => void;
}

export default function PromptWorktreeModal({
  isOpen,
  repoName,
  promptText,
  promptAgent,
  promptDangerousMode,
  promptInputMode,
  isCreating,
  isCreatingPlan,
  isLaunchOptionDisabled,
  showDangerousModeOption,
  onClose,
  onPromptTextChange,
  onPromptAgentChange,
  onPromptDangerousModeChange,
  onPromptInputModeChange,
  onCreatePlan,
  onSubmit,
}: PromptWorktreeModalProps) {
  if (!isOpen) {
    return null;
  }

  const promptPreviewHtml = useMemo(() => renderMarkdown(promptText), [promptText]);
  const promptPreviewIsEmpty = !promptPreviewHtml.trim();
  const dangerousModeCheckboxId = 'prompt-worktree-dangerous-mode';

  return h(
    Modal,
    {
      title: `Create worktree from prompt for ${repoName}`,
      onClose: () => {
        if (!isCreating) {
          onClose();
        }
      },
      size: 'lg',
      position: 'top'
    },
    h(
      'div',
      { className: 'space-y-4' },
      h(
        'div',
        { className: 'space-y-3' },
        h(
          'div',
          { className: 'flex items-center justify-between gap-3' },
          h(Label, null, 'Prompt'),
          h(
            'div',
            {
              className:
                'inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-950 p-0.5'
            },
            PROMPT_EDITOR_TABS.map((tab: any) => {
              const isActive = promptInputMode === tab.value;
              return h(
                'button',
                {
                  key: tab.value,
                  type: 'button',
                  onClick: () => onPromptInputModeChange(tab.value),
                  className: [
                    'rounded-md px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500/70',
                    isActive
                      ? 'bg-neutral-800 text-neutral-100 shadow-inner'
                      : 'text-neutral-400 hover:text-neutral-200'
                  ].join(' '),
                  'aria-pressed': isActive
                },
                tab.label
              );
            })
          )
        ),
        promptInputMode === 'edit'
          ? h(
              Fragment,
              null,
              h(TextArea, {
                value: promptText,
                onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => onPromptTextChange(event.target.value),
                placeholder: 'Describe the changes you need…',
                rows: 8,
                className: 'min-h-[200px]'
              }),
              h(
                LoadingButton,
                {
                  onClick: onCreatePlan,
                  loading: isCreatingPlan,
                  loadingText: 'Creating…',
                  disabled: !promptText.trim(),
                  variant: 'secondary',
                  className: 'mt-2 w-full'
                },
                'Create Plan'
              )
            )
          : h(
              'div',
              {
                className:
                  'markdown-preview min-h-[200px] max-h-[400px] w-full overflow-y-auto rounded-md border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm text-neutral-100 leading-relaxed'
              },
              promptPreviewIsEmpty
                ? h(
                    'p',
                    { className: 'text-sm text-neutral-500 italic' },
                    'Nothing to preview yet.'
                  )
                : h('div', {
                    className: 'markdown-preview__content space-y-3',
                    dangerouslySetInnerHTML: { __html: promptPreviewHtml }
                  })
            )
      ),
      h(
        'div',
        { className: 'space-y-2' },
        h(Label, null, 'Agent'),
        h(
          'div',
          { className: 'grid grid-cols-3 gap-2' },
          PROMPT_AGENT_OPTIONS.map((option: any) => {
            const isActive = promptAgent === option.value;
            return h(
              'button',
              {
                key: option.value,
                type: 'button',
                onClick: () => {
                  onPromptAgentChange(option.value);
                  if (option.value === 'cursor') {
                    onPromptDangerousModeChange(false);
                  }
                },
                className: [
                  'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200'
                    : 'border-neutral-700 bg-neutral-950 text-neutral-300 hover:bg-neutral-900'
                ].join(' ')
              },
              option.label
            );
          })
        )
      ),
      showDangerousModeOption
        ? h(
            'label',
            {
              className: 'inline-flex items-center gap-2 text-xs text-neutral-300',
              htmlFor: dangerousModeCheckboxId
            },
            h('input', {
              id: dangerousModeCheckboxId,
              type: 'checkbox',
              checked: promptDangerousMode,
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => onPromptDangerousModeChange(event.target.checked),
              className:
                'h-4 w-4 rounded border border-neutral-700 bg-neutral-950 text-neutral-100 focus:ring-1 focus:ring-neutral-500'
            }),
            'Start in Dangerous Mode'
          )
        : null,
      h(
        'p',
        { className: 'text-xs text-neutral-400' },
        'Branch name will be generated automatically based on your prompt.'
      )
    ),
    h(ModalFooter, {
      onCancel: () => {
        if (!isCreating) {
          onClose();
        }
      },
      onSubmit,
      submitText: 'Create workspace',
      loading: isCreating,
      loadingText: 'Launching…',
      disabled: isLaunchOptionDisabled
    })
  );
}

