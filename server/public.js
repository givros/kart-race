import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const port = Number(process.env.PORT ?? 8787);
const subdomain = process.env.PUBLIC_SUBDOMAIN ?? 'givros-kart-race';
const publicPage = 'https://givros.github.io/kart-race/';
const publicSocket = `wss://${subdomain}.loca.lt`;
const localHealth = `http://127.0.0.1:${port}/health`;

const children = new Set();

function isWindows() {
  return process.platform === 'win32';
}

function spawnChild(command, args, options = {}) {
  const child = spawn(command, args, {
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
    const text = chunk.toString();
    process.stdout.write(text.replace(/^/gm, `[${label}] `));
  });
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    process.stderr.write(text.replace(/^/gm, `[${label}] `));
  });
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

function cleanup() {
  for (const child of children) {
    if (!child.killed) child.kill();
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
console.log(`Serveur public : ${publicSocket}`);
console.log('');

let serverChild = null;
if (await healthCheck()) {
  console.log(`Serveur local deja actif sur ${localHealth}`);
} else {
  const node = isWindows() ? 'node.exe' : 'node';
  serverChild = spawnChild(node, ['server/index.js'], {
    env: { ...process.env, PORT: String(port) },
  });
  pipeOutput(serverChild, 'server');
  serverChild.once('exit', (code) => {
    if (code !== 0) {
      console.error(`Le serveur local s'est arrete avec le code ${code}.`);
      cleanup();
      process.exit(code ?? 1);
    }
  });

  if (!(await waitForServer())) {
    console.error(`Impossible de demarrer le serveur local sur ${localHealth}`);
    cleanup();
    process.exit(1);
  }
}

const npx = isWindows() ? 'npx.cmd' : 'npx';
const tunnel = spawnChild(npx, [
  '--yes',
  'localtunnel',
  '--port',
  String(port),
  '--local-host',
  '127.0.0.1',
  '--subdomain',
  subdomain,
], {
  shell: isWindows(),
});
pipeOutput(tunnel, 'tunnel');
tunnel.once('exit', (code) => {
  console.error(`Tunnel public arrete avec le code ${code}.`);
  if (serverChild) cleanup();
  process.exit(code ?? 1);
});

console.log('Quand le tunnel affiche son URL, les joueurs ouvrent simplement :');
console.log(publicPage);
console.log('');
