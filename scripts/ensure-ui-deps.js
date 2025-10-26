import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const uiDir = resolve(__dirname, '../ui');
const nodeModulesDir = resolve(uiDir, 'node_modules');

if (existsSync(nodeModulesDir)) {
  process.exit(0);
}

const install = spawnSync('npm', ['ci'], {
  cwd: uiDir,
  stdio: 'inherit',
});

if (install.status !== 0) {
  const exitCode = typeof install.status === 'number' ? install.status : 1;
  process.exit(exitCode);
}
