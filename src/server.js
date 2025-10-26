const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const { promisify } = require('util');
const { execFile } = require('child_process');
const { randomUUID, randomBytes, randomInt } = require('crypto');
const pty = require('node-pty');
const { WebSocketServer, WebSocket } = require('ws');

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 3414;
const execFileAsync = promisify(execFile);
const MAX_TERMINAL_BUFFER = 200000;
const PASSWORD_LENGTH = 12;
const SESSION_COOKIE_NAME = 'terminal_worktree_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

const TMUX_BIN = 'tmux';
const TMUX_SESSION_PREFIX = 'tw-';
let tmuxAvailable = false;
let tmuxVersion = null;
let tmuxDetection;

const terminalSessions = new Map();
const terminalSessionsById = new Map();

function pickRandomChar(source) {
  return source[randomInt(0, source.length)];
}

function shuffleArray(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
}

function generateRandomPassword() {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  const all = lowercase + uppercase + symbols;

  const chars = [
    pickRandomChar(lowercase),
    pickRandomChar(uppercase),
    pickRandomChar(symbols),
  ];

  while (chars.length < PASSWORD_LENGTH) {
    chars.push(pickRandomChar(all));
  }

  shuffleArray(chars);
  return chars.join('');
}

function generateSessionToken() {
  return randomBytes(24).toString('hex');
}

function parseCookies(cookieHeader) {
  if (typeof cookieHeader !== 'string' || !cookieHeader.trim()) {
    return {};
  }
  return cookieHeader.split(';').reduce((acc, part) => {
    const [name, ...rest] = part.split('=');
    if (!name) {
      return acc;
    }
    const key = name.trim();
    if (!key) {
      return acc;
    }
    const value = rest.join('=').trim();
    acc[key] = value;
    return acc;
  }, {});
}

async function detectTmux() {
  if (!tmuxDetection) {
    tmuxDetection = (async () => {
      try {
        const { stdout } = await execFileAsync(TMUX_BIN, ['-V'], { maxBuffer: 1024 * 1024 });
        tmuxAvailable = true;
        tmuxVersion = stdout ? stdout.trim() : null;
      } catch (error) {
        tmuxAvailable = false;
        tmuxVersion = null;
      }
      return { available: tmuxAvailable, version: tmuxVersion };
    })();
  }
  return tmuxDetection;
}

function isTmuxAvailable() {
  return tmuxAvailable;
}

async function runTmux(args, options = {}) {
  return execFileAsync(TMUX_BIN, args, { maxBuffer: 1024 * 1024, ...options });
}

function sanitiseTmuxComponent(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  const cleaned = trimmed
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || fallback;
}

function makeTmuxSessionName(org, repo, branch) {
  const orgPart = sanitiseTmuxComponent(org, 'org');
  const repoPart = sanitiseTmuxComponent(repo, 'repo');
  const branchPart = sanitiseTmuxComponent(branch, 'branch');
  return `${TMUX_SESSION_PREFIX}${orgPart}::${repoPart}::${branchPart}`;
}

function tmuxTarget(sessionName) {
  return `=${sessionName}`;
}

async function tmuxHasSession(sessionName) {
  try {
    await runTmux(['has-session', '-t', tmuxTarget(sessionName)]);
    return true;
  } catch (error) {
    if (typeof error.code === 'number') {
      return false;
    }
    throw error;
  }
}

async function tmuxKillSession(sessionName) {
  try {
    await runTmux(['kill-session', '-t', tmuxTarget(sessionName)]);
  } catch (error) {
    if (typeof error.code === 'number') {
      return;
    }
    throw error;
  }
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

async function loadUi(uiPath) {
  const resolvedPath = path.resolve(uiPath);
  try {
    const contents = await fs.readFile(resolvedPath, 'utf8');
    return { resolvedPath, contents };
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw new Error(`UI file not found at ${resolvedPath}`);
    }
    throw err;
  }
}

async function resolveWorkdir(dirPath) {
  const resolved = path.resolve(dirPath);
  try {
    const stats = await fs.stat(resolved);
    if (!stats.isDirectory()) {
      throw new Error(`Working directory is not a directory: ${resolved}`);
    }
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw new Error(`Working directory not found at ${resolved}`);
    }
    throw err;
  }
  return resolved;
}

async function listWorktrees(repositoryPath) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repositoryPath, 'worktree', 'list', '--porcelain'], {
      maxBuffer: 1024 * 1024,
    });

    if (!stdout.trim()) {
      return [];
    }

    const worktrees = [];
    const blocks = stdout.trim().split(/\n\n+/);
    blocks.forEach((block) => {
      let worktreePath = null;
      let branchName = null;
      block.split('\n').forEach((line) => {
        if (line.startsWith('worktree ')) {
          worktreePath = line.slice('worktree '.length).trim();
        } else if (line.startsWith('branch ')) {
          const ref = line.slice('branch '.length).trim();
          branchName = ref.replace(/^refs\/heads\//, '');
        }
      });
      worktrees.push({ path: worktreePath, branch: branchName });
    });

    return worktrees;
  } catch (error) {
    return [];
  }
}

function parseRepositoryUrl(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error('Repository URL is required');
  }

  const trimmed = input.trim();
  let org = '';
  let repo = '';

  const sshMatch = trimmed.match(/^git@[^:]+:([^/]+)\/(.+)$/);
  if (sshMatch) {
    org = sshMatch[1];
    repo = sshMatch[2];
  } else {
    try {
      if (/^[a-z]+:\/\//i.test(trimmed)) {
        const url = new URL(trimmed);
        const parts = url.pathname.replace(/^\//, '').split('/').filter(Boolean);
        if (parts.length >= 2) {
          org = parts[parts.length - 2];
          repo = parts[parts.length - 1];
        }
      }
    } catch (err) {
      // ignore URL parsing errors and fall back to manual parsing
    }

    if (!org || !repo) {
      const cleaned = trimmed.replace(/\.git$/, '');
      const segments = cleaned.split(/[\\/]+/).filter(Boolean);
      if (segments.length >= 2) {
        org = segments[segments.length - 2];
        repo = segments[segments.length - 1];
      }
    }

    if ((!org || !repo) && trimmed.includes(':')) {
      const tail = trimmed.split(':').pop() || '';
      const segments = tail.replace(/\.git$/, '').split('/').filter(Boolean);
      if (segments.length >= 2) {
        org = segments[segments.length - 2];
        repo = segments[segments.length - 1];
      }
    }
  }

  repo = repo ? repo.replace(/\.git$/, '') : repo;

  if (!org || !repo) {
    throw new Error('Unable to determine repository organisation and name from URL');
  }

  return { org, repo, url: trimmed };
}

function normaliseBranchName(branch) {
  if (typeof branch !== 'string') {
    return '';
  }
  return branch.trim();
}

function deriveWorktreeFolderName(branch) {
  const trimmed = normaliseBranchName(branch);
  if (!trimmed) {
    throw new Error('Branch name cannot be empty');
  }
  const parts = trimmed.split('/').filter(Boolean);
  const folder = parts[parts.length - 1];
  if (!folder) {
    throw new Error('Unable to derive worktree folder from branch name');
  }
  return folder;
}

async function ensureRepository(workdir, org, repo) {
  if (!org || !repo) {
    throw new Error('Repository identifier is incomplete');
  }

  const repoRoot = path.join(workdir, org, repo);
  const repositoryPath = path.join(repoRoot, 'repository');

  let stats;
  try {
    stats = await fs.stat(repositoryPath);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw new Error(`Repository not found for ${org}/${repo}`);
    }
    throw new Error(`Unable to access repository ${org}/${repo}: ${err.message}`);
  }

  if (!stats.isDirectory()) {
    throw new Error(`Repository path is not a directory: ${repositoryPath}`);
  }

  return { repoRoot, repositoryPath };
}

async function cloneRepository(workdir, repositoryUrl) {
  const { org, repo, url } = parseRepositoryUrl(repositoryUrl);
  const repoRoot = path.join(workdir, org, repo);
  const repositoryPath = path.join(repoRoot, 'repository');

  await fs.mkdir(repoRoot, { recursive: true });

  try {
    const stats = await fs.stat(repositoryPath);
    if (stats.isDirectory()) {
      throw new Error(`Repository already exists for ${org}/${repo}`);
    }
    throw new Error(`Cannot create repository at ${repositoryPath}`);
  } catch (err) {
    if (!err || err.code !== 'ENOENT') {
      throw err;
    }
  }

  try {
    await execFileAsync('git', ['clone', url, repositoryPath], { maxBuffer: 1024 * 1024 });
  } catch (error) {
    const stderr = error && error.stderr ? error.stderr.toString() : '';
    const message = stderr || error.message || 'Unknown git error';
    throw new Error(`Failed to clone repository: ${message.trim()}`);
  }

  return { org, repo };
}

async function branchExists(repositoryPath, branch) {
  try {
    await execFileAsync(
      'git',
      ['-C', repositoryPath, 'rev-parse', '--verify', `refs/heads/${branch}`],
      { maxBuffer: 1024 * 1024 },
    );
    return true;
  } catch (err) {
    return false;
  }
}

async function createWorktree(workdir, org, repo, branch) {
  const branchName = normaliseBranchName(branch);
  if (!branchName) {
    throw new Error('Branch name cannot be empty');
  }

  const { repoRoot, repositoryPath } = await ensureRepository(workdir, org, repo);
  const folderName = deriveWorktreeFolderName(branchName);
  const targetPath = path.join(repoRoot, folderName);

  try {
    await fs.access(targetPath);
    throw new Error(`Worktree directory already exists at ${targetPath}`);
  } catch (err) {
    if (!err || err.code !== 'ENOENT') {
      throw err;
    }
  }

  try {
    await execFileAsync(
      'git',
      ['-C', repositoryPath, 'checkout', 'main'],
      { maxBuffer: 1024 * 1024 },
    );
    await execFileAsync(
      'git',
      ['-C', repositoryPath, 'pull', '--ff-only', 'origin', 'main'],
      { maxBuffer: 1024 * 1024 },
    );

    const exists = await branchExists(repositoryPath, branchName);
    const args = ['-C', repositoryPath, 'worktree', 'add'];
    if (!exists) {
      args.push('-b', branchName);
    }
    args.push(targetPath);
    if (exists) {
      args.push(branchName);
    }
    await execFileAsync('git', args, { maxBuffer: 1024 * 1024 });
  } catch (error) {
    const stderr = error && error.stderr ? error.stderr.toString() : '';
    const message = stderr || error.message || 'Unknown git error';
    throw new Error(`Failed to create worktree: ${message.trim()}`);
  }
}

function makeSessionKey(org, repo, branch) {
  return `${org}::${repo}::${branch}`;
}

async function getWorktreePath(workdir, org, repo, branch) {
  const { repositoryPath } = await ensureRepository(workdir, org, repo);
  const worktrees = await listWorktrees(repositoryPath);
  const match = worktrees.find((item) => item.branch === branch);
  if (!match || !match.path) {
    throw new Error(`Worktree for ${org}/${repo} branch ${branch} not found`);
  }
  return { repositoryPath, worktreePath: match.path };
}

function trimLogBuffer(log) {
  if (log.length <= MAX_TERMINAL_BUFFER) {
    return log;
  }
  return log.slice(log.length - MAX_TERMINAL_BUFFER);
}

function broadcast(session, event, payload) {
  const message = JSON.stringify({ type: event, ...payload });
  session.watchers.forEach((watcher) => {
    const socket = watcher.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      try {
        socket.terminate();
      } catch (err) {
        // ignore terminate errors
      }
      session.watchers.delete(watcher);
      return;
    }
    try {
      socket.send(message);
    } catch (err) {
      try {
        socket.terminate();
      } catch (closeErr) {
        // ignore
      }
      session.watchers.delete(watcher);
    }
  });
}

function handleSessionOutput(session, chunk) {
  const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
  session.log = trimLogBuffer((session.log || '') + text);
  broadcast(session, 'output', { chunk: text });
}

function handleSessionExit(session, code, signal, error) {
  if (session.closed) {
    return;
  }
  session.closed = true;
  session.exitCode = code;
  session.exitSignal = signal;
  session.exitError = error ? error.message : undefined;
  broadcast(session, 'exit', {
    code: session.exitCode,
    signal: session.exitSignal,
    error: session.exitError,
  });
  session.watchers.forEach((watcher) => {
    if (watcher.socket && watcher.socket.readyState === WebSocket.OPEN) {
      try {
        watcher.socket.close();
      } catch (err) {
        // ignore
      }
    }
  });
  session.watchers.clear();
  terminalSessions.delete(session.key);
  terminalSessionsById.delete(session.id);
  if (session.waiters) {
    session.waiters.forEach((resolve) => resolve());
    session.waiters = [];
  }
}

async function terminateSession(session, options = {}) {
  if (!session || session.closed) {
    return;
  }

  await new Promise((resolve) => {
    session.waiters = session.waiters || [];
    session.waiters.push(resolve);
    try {
      session.process.kill(options.signal || 'SIGTERM');
    } catch (err) {
      resolve();
      return;
    }
    setTimeout(() => {
      if (!session.closed) {
        try {
          session.process.kill('SIGKILL');
        } catch (killErr) {
          // ignore
        }
      }
    }, options.forceAfter || 2000);
  });
}

async function disposeSessionByKey(key) {
  const session = terminalSessions.get(key);
  if (!session) {
    return;
  }
  await terminateSession(session);
}

function addSocketWatcher(session, socket) {
  const watcher = { socket };
  session.watchers.add(watcher);
  socket.on('close', () => {
    session.watchers.delete(watcher);
  });
}

function determineShellArgs(shellCommand) {
  if (!shellCommand) {
    return [];
  }
  const name = path.basename(shellCommand);
  if (name === 'bash') {
    return ['-il'];
  }
  if (name === 'zsh') {
    return ['-il'];
  }
  if (name === 'fish') {
    return ['-il'];
  }
  return [];
}

async function getOrCreateTerminalSession(workdir, org, repo, branch) {
  const key = makeSessionKey(org, repo, branch);
  let session = terminalSessions.get(key);
  if (session && !session.closed) {
    return { session, created: false };
  }
  if (session && session.closed) {
    terminalSessions.delete(key);
    terminalSessionsById.delete(session.id);
  }

  const { worktreePath } = await getWorktreePath(workdir, org, repo, branch);

  const shellCommand = process.env.SHELL || '/bin/bash';
  const args = determineShellArgs(shellCommand);

  let child;
  let usingTmux = false;
  let tmuxSessionName = null;
  let tmuxSessionExists = false;

  await detectTmux();
  if (isTmuxAvailable()) {
    tmuxSessionName = makeTmuxSessionName(org, repo, branch);
    tmuxSessionExists = await tmuxHasSession(tmuxSessionName);
    const tmuxArgs = tmuxSessionExists
      ? ['attach-session', '-t', tmuxTarget(tmuxSessionName)]
      : ['new-session', '-s', tmuxSessionName, '-c', worktreePath];
    if (!tmuxSessionExists && shellCommand) {
      tmuxArgs.push(shellCommand);
      if (Array.isArray(args) && args.length > 0) {
        tmuxArgs.push(...args);
      }
    }
    child = pty.spawn(TMUX_BIN, tmuxArgs, {
      cwd: worktreePath,
      env: {
        ...process.env,
        TERM: process.env.TERM || 'xterm-256color',
      },
      cols: 120,
      rows: 36,
    });
    usingTmux = true;
  } else {
    child = pty.spawn(shellCommand, args, {
      cwd: worktreePath,
      env: {
        ...process.env,
        TERM: process.env.TERM || 'xterm-256color',
      },
      cols: 120,
      rows: 36,
    });
  }

  session = {
    id: randomUUID(),
    key,
    org,
    repo,
    branch,
    process: child,
    worktreePath,
    usingTmux,
    tmuxSessionName,
    log: '',
    watchers: new Set(),
    closed: false,
    waiters: [],
  };

  terminalSessions.set(key, session);
  terminalSessionsById.set(session.id, session);

  child.on('data', (chunk) => handleSessionOutput(session, chunk));
  child.on('exit', (code, signal) => handleSessionExit(session, code, signal));

  const created = usingTmux ? !tmuxSessionExists : true;
  return { session, created };
}

async function discoverRepositories(workdir) {
  const result = {};

  let organisations;
  try {
    organisations = await fs.readdir(workdir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return result;
    }
    throw err;
  }

  for (const orgEntry of organisations) {
    if (!orgEntry.isDirectory()) {
      continue;
    }

    const orgName = orgEntry.name;
    const orgPath = path.join(workdir, orgName);
    let repoEntries;

    try {
      repoEntries = await fs.readdir(orgPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const repoEntry of repoEntries) {
      if (!repoEntry.isDirectory()) {
        continue;
      }

      const repoName = repoEntry.name;
      const repoRoot = path.join(orgPath, repoName);
      const repositoryPath = path.join(repoRoot, 'repository');

      try {
        const stats = await fs.stat(repositoryPath);
        if (!stats.isDirectory()) {
          continue;
        }
      } catch {
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const worktrees = await listWorktrees(repositoryPath);
      const branches = Array.from(
        new Set(
          worktrees
            .map((entry) => entry.branch)
            .filter((branch) => typeof branch === 'string' && branch.length > 0),
        ),
      );
      if (!result[orgName]) {
        result[orgName] = {};
      }
      result[orgName][repoName] = branches;
    }
  }

  return result;
}

async function removeWorktree(workdir, org, repo, branch) {
  const branchName = normaliseBranchName(branch);
  if (!branchName) {
    throw new Error('Branch name cannot be empty');
  }
  if (branchName.toLowerCase() === 'main') {
    throw new Error('Cannot remove the main worktree');
  }

  const sessionKey = makeSessionKey(org, repo, branchName);
  await disposeSessionByKey(sessionKey);
  await detectTmux();
  if (isTmuxAvailable()) {
    const tmuxSessionName = makeTmuxSessionName(org, repo, branchName);
    try {
      await tmuxKillSession(tmuxSessionName);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[terminal-worktree] Failed to kill tmux session ${tmuxSessionName}:`, err.message);
    }
  }

  const { repositoryPath } = await ensureRepository(workdir, org, repo);
  const worktrees = await listWorktrees(repositoryPath);
  const entry = worktrees.find((item) => item.branch === branchName);

  if (!entry || !entry.path) {
    return;
  }

  try {
    await execFileAsync(
      'git',
      ['-C', repositoryPath, 'worktree', 'remove', '--force', entry.path],
      { maxBuffer: 1024 * 1024 },
    );
  } catch (error) {
    const stderr = error && error.stderr ? error.stderr.toString() : '';
    const message = stderr || error.message || 'Unknown git error';
    throw new Error(`Failed to remove worktree: ${message.trim()}`);
  }
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalLength = 0;

    req.on('data', (chunk) => {
      chunks.push(chunk);
      totalLength += chunk.length;
      if (totalLength > 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        const buffer = Buffer.concat(chunks);
        const parsed = JSON.parse(buffer.toString('utf8'));
        resolve(parsed);
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

async function startServer({ uiPath, port = DEFAULT_PORT, host = DEFAULT_HOST, workdir, password } = {}) {
  if (!uiPath) {
    throw new Error('Missing required option: uiPath');
  }

  const { resolvedPath, contents } = await loadUi(uiPath);
  const resolvedWorkdir = workdir ? await resolveWorkdir(workdir) : process.cwd();
  const resolvedPassword =
    typeof password === 'string' && password.length > 0 ? password : generateRandomPassword();
  const validSessionTokens = new Set();
  const AUTH_EXEMPT_PATHS = new Set(['/api/auth/login', '/api/auth/logout', '/api/auth/status']);

  function getSessionTokenFromRequest(req) {
    const cookies = parseCookies(req.headers.cookie);
    return cookies[SESSION_COOKIE_NAME] || '';
  }

  function isAuthenticatedRequest(req) {
    const token = getSessionTokenFromRequest(req);
    return Boolean(token && validSessionTokens.has(token));
  }

  function setSessionCookie(res, token, options = {}) {
    const parts = [
      `${SESSION_COOKIE_NAME}=${token}`,
      'HttpOnly',
      'Path=/',
      'SameSite=Strict',
    ];
    if (options.maxAge != null) {
      parts.push(`Max-Age=${options.maxAge}`);
    }
    if (options.expires instanceof Date) {
      parts.push(`Expires=${options.expires.toUTCString()}`);
    }
    res.setHeader('Set-Cookie', parts.join('; '));
  }

  function clearSessionCookie(res) {
    const expires = new Date(0);
    setSessionCookie(res, '', { maxAge: 0, expires });
  }

  function ensureAuthenticated(req, res) {
    if (!isAuthenticatedRequest(req)) {
      sendJson(res, 401, { error: 'Authentication required' });
      return false;
    }
    return true;
  }

  async function handleLogin(req, res, method) {
    if (method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return;
    }

    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
      return;
    }

    const providedPassword =
      typeof payload.password === 'string' ? payload.password.trim() : '';
    if (!providedPassword) {
      sendJson(res, 400, { error: 'Password is required' });
      return;
    }
    if (providedPassword !== resolvedPassword) {
      sendJson(res, 401, { error: 'Invalid password' });
      return;
    }

    const existingToken = getSessionTokenFromRequest(req);
    if (existingToken) {
      validSessionTokens.delete(existingToken);
    }

    const token = generateSessionToken();
    validSessionTokens.add(token);
    setSessionCookie(res, token, { maxAge: SESSION_MAX_AGE_SECONDS });
    sendJson(res, 200, { authenticated: true });
  }

  async function handleLogout(req, res, method) {
    if (method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return;
    }

    const token = getSessionTokenFromRequest(req);
    if (token) {
      validSessionTokens.delete(token);
    }
    clearSessionCookie(res);
    sendJson(res, 200, { authenticated: false });
  }

  function handleStatus(req, res, method) {
    if (method !== 'GET' && method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return;
    }

    const authenticated = isAuthenticatedRequest(req);
    if (method === 'HEAD') {
      res.statusCode = 200;
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Authenticated', authenticated ? '1' : '0');
      res.end();
      return;
    }

    sendJson(res, 200, { authenticated });
  }
  const tmuxInfo = await detectTmux();
  if (tmuxInfo.available) {
    // eslint-disable-next-line no-console
    console.log(
      `[terminal-worktree] tmux detected${tmuxInfo.version ? ` (${tmuxInfo.version})` : ''}; persistent terminal sessions enabled`,
    );
  } else {
    // eslint-disable-next-line no-console
    console.log('[terminal-worktree] tmux not available; using direct node-pty sessions');
  }

  const server = http.createServer(async (req, res) => {
    try {
      const method = req.method || 'GET';
      const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const pathname = requestUrl.pathname;

      if (pathname === '/api/auth/login') {
        await handleLogin(req, res, method);
        return;
      }

      if (pathname === '/api/auth/logout') {
        await handleLogout(req, res, method);
        return;
      }

      if (pathname === '/api/auth/status') {
        handleStatus(req, res, method);
        return;
      }

      if (pathname.startsWith('/api/') && !AUTH_EXEMPT_PATHS.has(pathname)) {
        if (!ensureAuthenticated(req, res)) {
          return;
        }
      }

      if (pathname === '/api/repos') {
        if (method === 'GET' || method === 'HEAD') {
          try {
            const payload = await discoverRepositories(resolvedWorkdir);
            if (method === 'HEAD') {
              res.statusCode = 200;
              res.setHeader('Cache-Control', 'no-store');
              res.end();
            } else {
              sendJson(res, 200, { data: payload });
            }
          } catch (error) {
            const message = error && error.message ? error.message : 'Failed to read repositories';
            sendJson(res, 500, { error: message });
          }
          return;
        }

        if (method === 'POST') {
          let payload;
          try {
            payload = await readJsonBody(req);
          } catch (error) {
            sendJson(res, 400, { error: error.message });
            return;
          }

          const repoUrl =
            typeof payload.url === 'string' && payload.url.trim()
              ? payload.url.trim()
              : typeof payload.repoUrl === 'string' && payload.repoUrl.trim()
                ? payload.repoUrl.trim()
                : '';

          if (!repoUrl) {
            sendJson(res, 400, { error: 'Repository URL is required' });
            return;
          }

          try {
            const repoInfo = await cloneRepository(resolvedWorkdir, repoUrl);
            const data = await discoverRepositories(resolvedWorkdir);
            sendJson(res, 200, { data, repo: repoInfo });
          } catch (error) {
            sendJson(res, 500, { error: error.message });
          }
          return;
        }

        res.setHeader('Allow', 'GET, HEAD, POST');
        res.statusCode = 405;
        res.end('Method Not Allowed');
        return;
      }

      if (pathname === '/api/sessions') {
        if (method !== 'GET' && method !== 'HEAD') {
          res.setHeader('Allow', 'GET, HEAD');
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }

        const sessions = Array.from(terminalSessions.keys()).map((key) => {
          const [org, repo, branch] = key.split('::');
          return { org, repo, branch };
        });

        if (method === 'HEAD') {
          res.statusCode = 200;
          res.setHeader('Cache-Control', 'no-store');
          res.end();
        } else {
          sendJson(res, 200, { sessions });
        }
        return;
      }

      if (pathname === '/api/worktrees') {
        if (method !== 'POST' && method !== 'DELETE') {
          res.setHeader('Allow', 'POST, DELETE');
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }

        let payload;
        try {
          payload = await readJsonBody(req);
        } catch (error) {
          sendJson(res, 400, { error: error.message });
          return;
        }

        const org = typeof payload.org === 'string' ? payload.org.trim() : '';
        const repo = typeof payload.repo === 'string' ? payload.repo.trim() : '';
        const branch = typeof payload.branch === 'string' ? payload.branch.trim() : '';

        if (!org || !repo || !branch) {
          sendJson(res, 400, { error: 'org, repo, and branch are required' });
          return;
        }

        try {
          if (method === 'POST') {
            await createWorktree(resolvedWorkdir, org, repo, branch);
          } else {
            await removeWorktree(resolvedWorkdir, org, repo, branch);
          }
          const data = await discoverRepositories(resolvedWorkdir);
          sendJson(res, 200, { data });
        } catch (error) {
          sendJson(res, 500, { error: error.message });
        }
        return;
      }

      if (pathname === '/api/terminal/open') {
        if (method !== 'POST') {
          res.setHeader('Allow', 'POST');
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }

        let payload;
        try {
          payload = await readJsonBody(req);
        } catch (error) {
          sendJson(res, 400, { error: error.message });
          return;
        }

        const org = typeof payload.org === 'string' ? payload.org.trim() : '';
        const repo = typeof payload.repo === 'string' ? payload.repo.trim() : '';
        const branch = typeof payload.branch === 'string' ? payload.branch.trim() : '';
        const command = typeof payload.command === 'string' ? payload.command.trim() : '';

        if (!org || !repo || !branch) {
          sendJson(res, 400, { error: 'org, repo, and branch are required' });
          return;
        }
        if (branch.toLowerCase() === 'main') {
          sendJson(res, 400, { error: 'Terminal access to the main branch is disabled' });
          return;
        }

        try {
          const { session, created } = await getOrCreateTerminalSession(resolvedWorkdir, org, repo, branch);
          if (command && created) {
            const commandInput = command.endsWith('\n') || command.endsWith('\r') ? command : `${command}\r`;
            session.process.write(commandInput);
          }
          sendJson(res, 200, {
            sessionId: session.id,
            log: session.log || '',
            closed: !!session.closed,
            created,
          });
        } catch (error) {
          sendJson(res, 500, { error: error.message });
        }
        return;
      }

      if (pathname === '/api/terminal/send') {
        if (method !== 'POST') {
          res.setHeader('Allow', 'POST');
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }

        let payload;
        try {
          payload = await readJsonBody(req);
        } catch (error) {
          sendJson(res, 400, { error: error.message });
          return;
        }

        const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId.trim() : '';
        const input = typeof payload.input === 'string' ? payload.input : '';

        if (!sessionId) {
          sendJson(res, 400, { error: 'sessionId is required' });
          return;
        }

        const session = terminalSessionsById.get(sessionId);
        if (!session || session.closed) {
          sendJson(res, 404, { error: 'Terminal session not found' });
          return;
        }

        try {
          const payloadInput = input.endsWith('\n') || input.endsWith('\r') ? input : `${input}\r`;
          session.process.write(payloadInput);
          sendJson(res, 200, { ok: true });
        } catch (error) {
          sendJson(res, 500, { error: error.message });
        }
        return;
      }

      if (method !== 'GET' && method !== 'HEAD') {
        res.statusCode = 405;
        res.setHeader('Allow', 'GET, HEAD');
        res.end('Method Not Allowed');
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');

      if (method === 'HEAD') {
        res.end();
      } else {
        res.end(contents);
      }
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Internal Server Error');
      // eslint-disable-next-line no-console
      console.error('Server error:', err);
    }
  });

  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (socket, request) => {
    try {
      const url = new URL(request.url || '', 'http://localhost');
      const sessionId = url.searchParams.get('sessionId');
      if (!sessionId) {
        socket.send(JSON.stringify({ type: 'error', message: 'sessionId is required' }));
        socket.close();
        return;
      }

      const session = terminalSessionsById.get(sessionId);
      if (!session) {
        socket.send(JSON.stringify({ type: 'error', message: 'Terminal session not found' }));
        socket.close();
        return;
      }

      addSocketWatcher(session, socket);

      socket.on('message', (data) => {
        if (session.closed) {
          return;
        }
        const raw = typeof data === 'string' ? data : data.toString('utf8');
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch (err) {
          parsed = null;
        }
        if (parsed && parsed.type === 'input') {
          const payload = typeof parsed.data === 'string' ? parsed.data : '';
          session.process.write(payload);
        } else if (parsed && parsed.type === 'resize') {
          const cols = Number.parseInt(parsed.cols, 10);
          const rows = Number.parseInt(parsed.rows, 10);
          if (Number.isInteger(cols) && Number.isInteger(rows) && cols > 0 && rows > 0) {
            session.process.resize(cols, rows);
          }
        } else {
          session.process.write(raw);
        }
      });

      socket.on('error', () => {
        socket.close();
      });

      socket.send(
        JSON.stringify({
          type: 'init',
          log: session.log || '',
          closed: !!session.closed,
        }),
      );
      if (session.closed) {
        socket.send(
          JSON.stringify({
            type: 'exit',
            code: session.exitCode,
            signal: session.exitSignal,
            error: session.exitError,
          }),
        );
        socket.close();
      }
    } catch (error) {
      socket.send(JSON.stringify({ type: 'error', message: error.message }));
      socket.close();
    }
  });

  server.on('upgrade', (req, socket, head) => {
    try {
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname === '/api/terminal/socket') {
        const cookies = parseCookies(req.headers.cookie);
        const token = cookies[SESSION_COOKIE_NAME] || '';
        if (!token || !validSessionTokens.has(token)) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit('connection', ws, req);
        });
      } else {
        socket.destroy();
      }
    } catch (err) {
      socket.destroy();
    }
  });

  let closing = false;
  async function closeAll() {
    if (closing) {
      return;
    }
    closing = true;

    const sessionClosures = Array.from(terminalSessions.values()).map((session) =>
      terminateSession(session, { signal: 'SIGTERM', forceAfter: 0 }).catch(() => {}),
    );

    const serverClose = new Promise((resolve) => {
      server.close(() => resolve());
    });

    const wssClose = new Promise((resolve) => {
      try {
        wss.clients.forEach((client) => {
          try {
            client.close();
          } catch (err) {
            // ignore
          }
        });
        wss.close(() => resolve());
      } catch (err) {
        resolve();
      }
    });

    await Promise.allSettled(sessionClosures);
    await Promise.all([serverClose, wssClose]);

    terminalSessions.clear();
    terminalSessionsById.clear();
    validSessionTokens.clear();
  }

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  return {
    server,
    host,
    port,
    uiPath: resolvedPath,
    workdir: resolvedWorkdir,
    close: closeAll,
    password: resolvedPassword,
  };
}

module.exports = {
  startServer,
  DEFAULT_HOST,
  DEFAULT_PORT,
  generateRandomPassword,
};
