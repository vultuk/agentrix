import { DEFAULT_HOST, DEFAULT_PORT } from '../server/index.js';
import { VALID_TERMINAL_SESSION_MODES } from './constants.js';
import type { ParsedArgs } from './types.js';

class ArgumentParser {
  private args: Omit<ParsedArgs, '_provided'>;
  private provided: Record<string, boolean>;
  private terminalSessionModeSource: string | null = null;

  constructor() {
    this.args = this.createDefaultArgs();
    this.provided = this.createProvidedTracker();
  }

  private createDefaultArgs() {
    return {
      port: DEFAULT_PORT,
      host: DEFAULT_HOST,
      ui: null,
      workdir: null,
      password: null,
      cookieSecure: null,
      defaultBranch: null,
      showPassword: false,
      codexCommand: null,
      claudeCommand: null,
      cursorCommand: null,
      ideCommand: null,
      vscodeCommand: null,
      ngrokApiKey: null,
      ngrokDomain: null,
      openaiApiKey: null,
      terminalSessionMode: null,
      save: false,
      help: false,
      version: false,
    };
  }

  private createProvidedTracker() {
    return {
      port: false,
      host: false,
      ui: false,
      workdir: false,
      password: false,
      cookieSecure: false,
      defaultBranch: false,
      showPassword: false,
      codexCommand: false,
      claudeCommand: false,
      cursorCommand: false,
      ideCommand: false,
      vscodeCommand: false,
      ngrokApiKey: false,
      ngrokDomain: false,
      openaiApiKey: false,
      terminalSessionMode: false,
      save: false,
    };
  }

  private requireValue(_token: string, value: string | undefined): string {
    if (!value) {
      throw new Error(`Expected value after ${_token}`);
    }
    return value;
  }

  private requireNonEmpty(_token: string, value: string, fieldName: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error(`${fieldName} cannot be empty`);
    }
    return trimmed;
  }

  private setTerminalSessionMode(rawValue: string, sourceToken: string): void {
    const normalized = this.requireNonEmpty(sourceToken, rawValue, 'Terminal session mode');
    const lower = normalized.toLowerCase();

    if (!VALID_TERMINAL_SESSION_MODES.has(lower)) {
      throw new Error(
        `Invalid terminal session mode "${rawValue}". Expected one of: ${[
          ...VALID_TERMINAL_SESSION_MODES,
        ].join(', ')}`,
      );
    }

    if (this.provided['terminalSessionMode']) {
      if (this.args.terminalSessionMode !== lower) {
        throw new Error(
          `Conflicting terminal session mode options (${this.terminalSessionModeSource} and ${sourceToken})`,
        );
      }
      return;
    }

    this.args.terminalSessionMode = lower;
    this.provided['terminalSessionMode'] = true;
    this.terminalSessionModeSource = sourceToken;
  }

  private parsePort(_token: string, value: string): number {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      throw new Error(`Invalid port: ${value}`);
    }
    return parsed;
  }

  private parseCookieSecure(_token: string, value: string): string {
    const trimmed = value.trim().toLowerCase();
    if (!['true', 'false', 'auto'].includes(trimmed)) {
      throw new Error('cookie-secure must be one of: true, false, auto');
    }
    return trimmed;
  }

  parse(argv: string[]): ParsedArgs {
    for (let i = 0; i < argv.length; i += 1) {
      const token = argv[i];

      switch (token) {
        case '--port':
        case '-p': {
          const value = this.requireValue(token, argv[++i]);
          this.args.port = this.parsePort(token, value);
          this.provided['port'] = true;
          break;
        }
        case '--host':
        case '-H': {
          this.args.host = this.requireValue(token, argv[++i]);
          this.provided['host'] = true;
          break;
        }
        case '--ui':
        case '-u': {
          this.args.ui = this.requireValue(token, argv[++i]);
          this.provided['ui'] = true;
          break;
        }
        case '--workdir':
        case '-w': {
          this.args.workdir = this.requireValue(token, argv[++i]);
          this.provided['workdir'] = true;
          break;
        }
        case '--cookie-secure': {
          const value = this.requireValue(token, argv[++i]);
          this.args.cookieSecure = this.parseCookieSecure(token, value);
          this.provided['cookieSecure'] = true;
          break;
        }
        case '--terminal-session-mode': {
          const value = this.requireValue(token, argv[++i]);
          this.setTerminalSessionMode(value, token);
          break;
        }
        case '--force-tmux': {
          this.setTerminalSessionMode('tmux', token);
          break;
        }
        case '--no-tmux': {
          this.setTerminalSessionMode('pty', token);
          break;
        }
        case '--default-branch': {
          const value = this.requireValue(token, argv[++i]);
          this.args.defaultBranch = this.requireNonEmpty(token, value, 'Default branch');
          this.provided['defaultBranch'] = true;
          break;
        }
        case '--password':
        case '-P': {
          const value = this.requireValue(token, argv[++i]);
          this.args.password = this.requireNonEmpty(token, value, 'Password');
          this.provided['password'] = true;
          break;
        }
        case '--show-password': {
          this.args.showPassword = true;
          this.provided['showPassword'] = true;
          break;
        }
        case '--codex-command': {
          this.args.codexCommand = this.requireValue(token, argv[++i]);
          this.provided['codexCommand'] = true;
          break;
        }
        case '--claude-command': {
          this.args.claudeCommand = this.requireValue(token, argv[++i]);
          this.provided['claudeCommand'] = true;
          break;
        }
        case '--cursor-command': {
          this.args.cursorCommand = this.requireValue(token, argv[++i]);
          this.provided['cursorCommand'] = true;
          break;
        }
        case '--ide-command': {
          this.args.ideCommand = this.requireValue(token, argv[++i]);
          this.provided['ideCommand'] = true;
          break;
        }
        case '--vscode-command': {
          this.args.vscodeCommand = this.requireValue(token, argv[++i]);
          this.provided['vscodeCommand'] = true;
          break;
        }
        case '--ngrok-api-key': {
          const value = this.requireValue(token, argv[++i]);
          this.args.ngrokApiKey = this.requireNonEmpty(token, value, 'ngrok API key');
          this.provided['ngrokApiKey'] = true;
          break;
        }
        case '--ngrok-domain': {
          const value = this.requireValue(token, argv[++i]);
          this.args.ngrokDomain = this.requireNonEmpty(token, value, 'ngrok domain');
          this.provided['ngrokDomain'] = true;
          break;
        }
        case '--openai-api-key': {
          const value = this.requireValue(token, argv[++i]);
          this.args.openaiApiKey = this.requireNonEmpty(token, value, 'OpenAI API key');
          this.provided['openaiApiKey'] = true;
          break;
        }
        case '--save': {
          this.args.save = true;
          this.provided['save'] = true;
          break;
        }
        case '--help':
        case '-h':
          this.args.help = true;
          break;
        case '--version':
        case '-v':
          this.args.version = true;
          break;
        default:
          if (token && token.startsWith('-')) {
            throw new Error(`Unknown option: ${token}`);
          } else {
            throw new Error(`Unexpected argument: ${token}`);
          }
      }
    }

    return {
      ...this.args,
      _provided: this.provided,
    };
  }
}

export function parseArgs(argv: string[]): ParsedArgs {
  const parser = new ArgumentParser();
  return parser.parse(argv);
}

