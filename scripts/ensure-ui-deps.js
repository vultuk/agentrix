import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const workspaceRoot = resolve(__dirname, '..');
const uiDir = resolve(workspaceRoot, 'ui');
const nodeModulesDir = resolve(uiDir, 'node_modules');

if (existsSync(nodeModulesDir)) {
  process.exit(0);
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd ?? workspaceRoot,
    stdio: 'inherit',
  });
}

let install = run('bun', ['install', '--filter', 'terminal-worktree-ui']);

if (install.status !== 0) {
  install = run('npm', ['ci'], { cwd: uiDir });
}

if (install.status !== 0) {
  const exitCode = typeof install.status === 'number' ? install.status : 1;
  process.exit(exitCode);
}
