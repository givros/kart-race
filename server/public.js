import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const configPath = path.join(rootDir, 'public', 'server.json');
const port = Number(process.env.PORT ?? 8787);
const publicPage = 'https://givros.github.io/kart-race/';
const localHealth = `http://127.0.0.1:${port}/health`;
const tunnelHealthIntervalMs = 15000;
const tunnelHealthFailuresBeforeRestart = 2;
const tunnelHealthAttempts = 12;
const children = new Set();
let activeTunnel = null;
let activeTunnelUrl = '';
let tunnelFailures = 0;
let restartingTunnel = false;
let shuttingDown = false;

function isWindows() {
  return process.platform === 'win32';
}

function command(name) {
  return isWindows() ? `${name}.cmd` : name;
}

function spawnChild(cmd, args, options = {}) {
  const child = spawn(cmd, args, {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    ...options,
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

function pipeOutput(child, label) {
  child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk.toString().replace(/^/gm, `[${label}] `));
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk.toString().replace(/^/gm, `[${label}] `));
  });
}

function stopChild(child) {
  if (!child || child.killed) return;
  child.kill();
}

function cleanup() {
  shuttingDown = true;
  for (const child of children) stopChild(child);
}

function runGit(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: options.quiet ? 'pipe' : 'inherit',
  });
  return result;
}

function healthCheck() {
  return new Promise((resolve) => {
    const request = http.get(localHealth, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on('error', () => resolve(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (await healthCheck()) return true;
    await wait(500);
  }
  return false;
}

async function startServer() {
  if (await healthCheck()) {
    console.log(`Serveur local deja actif sur ${localHealth}`);
    return null;
  }

  const server = spawnChild(isWindows() ? 'node.exe' : 'node', ['server/index.js'], {
    env: { ...process.env, PORT: String(port) },
  });
  pipeOutput(server, 'server');
  server.once('exit', (code) => {
    if (code !== 0) {
      console.error(`Le serveur local s'est arrete avec le code ${code}.`);
      cleanup();
      process.exit(code ?? 1);
    }
  });

  if (!(await waitForServer())) {
    throw new Error(`Impossible de demarrer le serveur local sur ${localHealth}`);
  }
  return server;
}

async function startTunnel() {
  const tunnel = spawnChild(command('npx'), [
    '--yes',
    'localtunnel',
    '--port',
    String(port),
    '--local-host',
    '127.0.0.1',
  ], {
    shell: isWindows(),
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    tunnel.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text.replace(/^/gm, '[tunnel] '));
      const match = text.match(/https:\/\/[^\s]+/i);
      if (match) finish(resolve, { tunnel, url: match[0] });
    });
    tunnel.stderr.on('data', (chunk) => {
      process.stderr.write(chunk.toString().replace(/^/gm, '[tunnel] '));
    });
    tunnel.once('exit', (code) => {
      finish(reject, new Error(`Tunnel arrete avant ouverture (${code}).`));
    });
    setTimeout(() => {
      finish(reject, new Error("Le tunnel n'a pas donne d'URL a temps."));
    }, 20000);
  });
}

async function tunnelHealthCheck(tunnelUrl, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${tunnelUrl.replace(/\/$/u, '')}/health`, {
      cache: 'no-store',
      headers: {
        'bypass-tunnel-reminder': '1',
      },
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

async function waitForTunnelHealth(tunnelUrl) {
  for (let attempt = 0; attempt < tunnelHealthAttempts; attempt += 1) {
    if (await tunnelHealthCheck(tunnelUrl)) return true;
    await wait(1000);
  }
  return false;
}

async function publishServerUrl(tunnelUrl) {
  const wsUrl = tunnelUrl.replace(/^https:/i, 'wss:');
  await fs.writeFile(`${configPath}`, `${JSON.stringify({ wsUrl }, null, 2)}\n`, 'utf8');

  runGit(['add', 'public/server.json']);
  const commit = runGit(['commit', '-m', 'Update public server URL'], { quiet: true });
  if (commit.status === 0) {
    const push = runGit(['push']);
    if (push.status !== 0) throw new Error("Impossible de pousser l'URL publique vers GitHub.");
  } else if (!String(commit.stdout ?? '').includes('nothing to commit')) {
    throw new Error(commit.stderr || commit.stdout || "Impossible de committer l'URL publique.");
  }

  return wsUrl;
}

async function rotateTunnel(reason = 'initialisation') {
  if (restartingTunnel) return null;
  restartingTunnel = true;
  try {
    if (activeTunnel) {
      stopChild(activeTunnel);
      activeTunnel = null;
      activeTunnelUrl = '';
      await wait(1000);
    }

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      let tunnel = null;
      try {
        console.log(`Ouverture tunnel public (${reason}, tentative ${attempt}/5)...`);
        const opened = await startTunnel();
        tunnel = opened.tunnel;
        activeTunnel = tunnel;
        activeTunnelUrl = opened.url;

        tunnel.once('exit', (code) => {
          if (shuttingDown || activeTunnel !== tunnel) return;
          console.error(`Tunnel public arrete avec le code ${code}. Relance...`);
          activeTunnel = null;
          activeTunnelUrl = '';
          void rotateTunnel(`tunnel arrete (${code})`).catch((error) => {
            console.error(error?.message ?? error);
            cleanup();
            process.exit(1);
          });
        });

        if (!(await waitForTunnelHealth(opened.url))) {
          throw new Error(`Tunnel public injoignable sur ${opened.url}`);
        }

        const wsUrl = await publishServerUrl(opened.url);
        tunnelFailures = 0;
        console.log('');
        console.log('Session publique prete.');
        console.log(`Serveur public : ${wsUrl}`);
        console.log(`Les joueurs ouvrent : ${publicPage}`);
        console.log('Garde ce terminal ouvert pendant la partie.');
        console.log('');
        return wsUrl;
      } catch (error) {
        console.error(`Echec tunnel public: ${error?.message ?? error}`);
        if (tunnel) stopChild(tunnel);
        if (activeTunnel === tunnel) {
          activeTunnel = null;
          activeTunnelUrl = '';
        }
        await wait(2500);
      }
    }

    throw new Error('Impossible de relancer un tunnel public stable.');
  } finally {
    restartingTunnel = false;
  }
}

async function watchTunnel() {
  while (!shuttingDown) {
    await wait(tunnelHealthIntervalMs);
    if (shuttingDown || restartingTunnel || !activeTunnelUrl) continue;
    if (await tunnelHealthCheck(activeTunnelUrl)) {
      tunnelFailures = 0;
      continue;
    }

    tunnelFailures += 1;
    console.error(`Tunnel public non joignable (${tunnelFailures}/${tunnelHealthFailuresBeforeRestart}).`);
    if (tunnelFailures >= tunnelHealthFailuresBeforeRestart) {
      await rotateTunnel('healthcheck echec');
    }
  }
}

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});
process.on('exit', cleanup);

console.log('');
console.log('Kart Race public session');
console.log(`Page joueurs : ${publicPage}`);
console.log('');

try {
  await startServer();
  await rotateTunnel('demarrage');
  void watchTunnel().catch((error) => {
    console.error(error?.message ?? error);
    cleanup();
    process.exit(1);
  });
} catch (error) {
  console.error(error?.message ?? error);
  cleanup();
  process.exit(1);
}
