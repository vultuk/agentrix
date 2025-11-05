import React from 'react';
import Modal from '../../../../components/Modal.js';
import Input from '../../../../components/Input.js';
import TextArea from '../../../../components/TextArea.js';
import FormField from '../../../../components/FormField.js';
import ModalFooter from '../../../../components/ModalFooter.js';

const { createElement: h } = React;

interface AddRepositoryModalProps {
  isOpen: boolean;
  repoUrl: string;
  repoInitCommand: string;
  isAdding: boolean;
  onClose: () => void;
  onRepoUrlChange: (value: string) => void;
  onInitCommandChange: (value: string) => void;
  onSubmit: () => void;
}

export default function AddRepositoryModal({
  isOpen,
  repoUrl,
  repoInitCommand,
  isAdding,
  onClose,
  onRepoUrlChange,
  onInitCommandChange,
  onSubmit,
}: AddRepositoryModalProps) {
  if (!isOpen) {
    return null;
  }

  return h(
    Modal,
    { title: 'Add repository', onClose },
    h(
      FormField,
      { label: 'Repository URL' },
      h(Input, {
        value: repoUrl,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => onRepoUrlChange(event.target.value),
        placeholder: 'https://github.com/org/repo.git'
      })
    ),
    h(
      FormField,
      { 
        label: 'Init command (optional)',
        helperText: 'Runs once after each new worktree is created. Leave blank to skip.',
        className: 'pt-2'
      },
      h(TextArea, {
        value: repoInitCommand,
        onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => onInitCommandChange(event.target.value),
        placeholder: 'npm install',
        rows: 3
      })
    ),
    h(ModalFooter, {
      onCancel: onClose,
      onSubmit,
      submitText: 'Add repository',
      loading: isAdding,
      loadingText: 'Adding…'
    })
  );
}

