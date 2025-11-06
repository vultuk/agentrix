import path from 'node:path';
import { getWorktreePath } from '../core/git.js';
import { listPlansForWorktree, readPlanFromWorktree } from '../core/plan-storage.js';
import type { PlansOptions } from './types.js';

export function printPlansHelp(): void {
  const helpText = `Usage: agentrix plans <command> [options]

Commands:
  list    List saved plans for a worktree
  show    Print the contents of a saved plan

Options:
  --org <name>        Repository organisation
  --repo <name>       Repository name
  --branch <branch>   Branch/worktree name
  --plan-id <file>    Identifier returned by the list command (show only)
  --limit <number>    Maximum number of plans to list (list only)
  --workdir <path>    Override workdir root (defaults to current directory)
  -h, --help          Show this help message
`;
  process.stdout.write(helpText);
}

interface PlansDependencies {
  getWorktreePath: typeof getWorktreePath;
  listPlansForWorktree: typeof listPlansForWorktree;
  readPlanFromWorktree: typeof readPlanFromWorktree;
}

const defaultDependencies: PlansDependencies = {
  getWorktreePath,
  listPlansForWorktree,
  readPlanFromWorktree,
};

let activeDependencies: PlansDependencies = { ...defaultDependencies };

export function __setPlansCommandTestOverrides(overrides?: Partial<PlansDependencies>): void {
  if (!overrides) {
    activeDependencies = { ...defaultDependencies };
    return;
  }
  activeDependencies = { ...activeDependencies, ...overrides };
}

function parsePlansOptions(args: string[]): PlansOptions {
  const options: PlansOptions = {
    org: '',
    repo: '',
    branch: '',
    planId: '',
    limit: undefined,
    workdir: process.cwd(),
    help: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    switch (token) {
      case '--org':
        options.org = (args[++i] || '').trim();
        break;
      case '--repo':
        options.repo = (args[++i] || '').trim();
        break;
      case '--branch':
        options.branch = (args[++i] || '').trim();
        break;
      case '--plan-id':
        options.planId = (args[++i] || '').trim();
        break;
      case '--limit': {
        const value = args[++i];
        if (!value) {
          throw new Error('Expected value after --limit');
        }
        const parsed = Number.parseInt(value, 10);
        if (!Number.isInteger(parsed) || parsed < 1) {
          throw new Error('limit must be a positive integer');
        }
        options.limit = parsed;
        break;
      }
      case '--workdir': {
        const value = args[++i];
        if (!value) {
          throw new Error('Expected value after --workdir');
        }
        options.workdir = path.resolve(process.cwd(), value);
        break;
      }
      case '-h':
      case '--help':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option for plans command: ${token}`);
    }
  }

  return options;
}

async function handleListCommand(options: PlansOptions): Promise<void> {
  const { worktreePath } = await activeDependencies.getWorktreePath(
    options.workdir,
    options.org,
    options.repo,
    options.branch,
  );

  const plans = await activeDependencies.listPlansForWorktree({
    worktreePath,
    branch: options.branch,
    limit: options.limit,
  });

  if (plans.length === 0) {
    process.stdout.write('No plans found.\n');
    return;
  }

  plans.forEach((plan) => {
    process.stdout.write(`${plan.createdAt}\t${plan.id}\n`);
  });
}

async function handleShowCommand(options: PlansOptions): Promise<void> {
  if (!options.planId) {
    process.stderr.write('planId is required for the show command.\n');
    process.exitCode = 1;
    return;
  }

  const { worktreePath } = await activeDependencies.getWorktreePath(
    options.workdir,
    options.org,
    options.repo,
    options.branch,
  );

  const plan = await activeDependencies.readPlanFromWorktree({
    worktreePath,
    branch: options.branch,
    id: options.planId,
  });

  process.stdout.write(`# ${plan.id}\n\n${plan.content}`);
}

export async function handlePlansCommand(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;

  if (!command || command === '--help' || command === '-h') {
    printPlansHelp();
    return;
  }

  if (command !== 'list' && command !== 'show') {
    process.stderr.write(`Unknown plans command: ${command}\n`);
    printPlansHelp();
    process.exitCode = 1;
    return;
  }

  let options: PlansOptions;
  try {
    options = parsePlansOptions(rest);
  } catch (error: unknown) {
    const err = error as { message?: string };
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    printPlansHelp();
    return;
  }

  if (!options.org || !options.repo || !options.branch) {
    process.stderr.write('org, repo, and branch are required.\n');
    process.exitCode = 1;
    return;
  }

  try {
    if (command === 'list') {
      await handleListCommand(options);
    } else {
      await handleShowCommand(options);
    }
  } catch (error: unknown) {
    const err = error as { message?: string };
    process.stderr.write(`${err?.message || error}\n`);
    process.exitCode = 1;
  }
}


