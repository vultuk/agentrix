import { useState, useCallback } from 'react';

type LaunchOption = 'terminal' | 'vscode' | 'codex' | 'cursor' | 'claude';
type PromptAgent = 'codex' | 'cursor-agent' | 'claude';
type PromptInputMode = 'edit' | 'preview';

export function useFormState() {
  // Add Repository form
  const [repoUrl, setRepoUrl] = useState('');
  const [repoInitCommand, setRepoInitCommand] = useState('');

  // Create Worktree form
  const [branchName, setBranchName] = useState('');
  const [worktreeLaunchOption, setWorktreeLaunchOption] = useState<LaunchOption>('terminal');
  const [launchDangerousMode, setLaunchDangerousMode] = useState(false);

  // Prompt Worktree form
  const [promptText, setPromptText] = useState('');
  const [promptAgent, setPromptAgent] = useState<PromptAgent>('codex');
  const [promptDangerousMode, setPromptDangerousMode] = useState(false);
  const [promptInputMode, setPromptInputMode] = useState<PromptInputMode>('edit');

  const resetAddRepoForm = useCallback(() => {
    setRepoUrl('');
    setRepoInitCommand('');
  }, []);

  const resetWorktreeForm = useCallback(() => {
    setBranchName('');
    setWorktreeLaunchOption('terminal');
    setLaunchDangerousMode(false);
  }, []);

  const resetPromptWorktreeForm = useCallback(() => {
    setPromptText('');
    setPromptAgent('codex');
    setPromptDangerousMode(false);
    setPromptInputMode('edit');
  }, []);

  const resetAllForms = useCallback(() => {
    resetAddRepoForm();
    resetWorktreeForm();
    resetPromptWorktreeForm();
  }, [resetAddRepoForm, resetWorktreeForm, resetPromptWorktreeForm]);

  return {
    // Add Repository
    repoUrl,
    setRepoUrl,
    repoInitCommand,
    setRepoInitCommand,
    
    // Create Worktree
    branchName,
    setBranchName,
    worktreeLaunchOption,
    setWorktreeLaunchOption,
    launchDangerousMode,
    setLaunchDangerousMode,
    
    // Prompt Worktree
    promptText,
    setPromptText,
    promptAgent,
    setPromptAgent,
    promptDangerousMode,
    setPromptDangerousMode,
    promptInputMode,
    setPromptInputMode,
    
    // Reset actions
    resetAddRepoForm,
    resetWorktreeForm,
    resetPromptWorktreeForm,
    resetAllForms,
  };
}

