/**
 * Hook for loading and managing command configuration
 */

import { useCallback, useEffect, useState } from 'react';
import * as reposService from '../services/api/reposService.js';
import { isAuthenticationError } from '../services/api/api-client.js';
import { DEFAULT_COMMAND_CONFIG } from '../config/commands.js';
import { parseCommand } from '../utils/repository.js';

interface UseCommandConfigOptions {
  onAuthExpired?: () => void;
}

export function useCommandConfig({ onAuthExpired }: UseCommandConfigOptions = {}) {
  const [commandConfig, setCommandConfig] = useState<{
    codex: string;
    codexDangerous: string;
    claude: string;
    claudeDangerous: string;
    cursor: string;
    vscode: string;
  }>(DEFAULT_COMMAND_CONFIG);

  useEffect(() => {
    let cancelled = false;

    const loadCommands = async () => {
      try {
        const commands = await reposService.fetchCommands();
        if (!commands || typeof commands !== 'object') {
          return;
        }
        const nextConfig = {
          codex: parseCommand(commands.codex, DEFAULT_COMMAND_CONFIG.codex),
          codexDangerous: parseCommand(
            commands.codexDangerous,
            DEFAULT_COMMAND_CONFIG.codexDangerous
          ),
          claude: parseCommand(commands.claude, DEFAULT_COMMAND_CONFIG.claude),
          claudeDangerous: parseCommand(
            commands.claudeDangerous,
            DEFAULT_COMMAND_CONFIG.claudeDangerous
          ),
          cursor: parseCommand(
            commands.cursor ?? commands.ide,
            DEFAULT_COMMAND_CONFIG.cursor
          ),
          vscode: parseCommand(commands.vscode, DEFAULT_COMMAND_CONFIG.vscode),
        };
        if (!cancelled) {
          setCommandConfig(nextConfig);
        }
      } catch (error: any) {
        if (isAuthenticationError(error)) {
          if (onAuthExpired) {
            onAuthExpired();
          }
          return;
        }
        console.error('Failed to load command configuration', error);
      }
    };

    loadCommands();

    return () => {
      cancelled = true;
    };
  }, [onAuthExpired]);

  const getCommandForLaunch = useCallback(
    (action: string, dangerousMode = false): string | undefined => {
      switch (action) {
        case 'codex':
          return dangerousMode ? commandConfig.codexDangerous : commandConfig.codex;
        case 'claude':
          return dangerousMode ? commandConfig.claudeDangerous : commandConfig.claude;
        case 'ide':
        case 'cursor':
          return commandConfig.cursor;
        case 'vscode':
          return commandConfig.vscode;
        default:
          return undefined;
      }
    },
    [commandConfig]
  );

  return {
    commandConfig,
    getCommandForLaunch,
  };
}

