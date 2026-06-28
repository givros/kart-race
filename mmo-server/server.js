const http = require('http');
const { WebSocket, WebSocketServer } = require('ws');

const maxPlayers = Number(process.env.MAX_PLAYERS || 15);
const lobbyCodeLength = 5;
const heartbeatMs = Number(process.env.HEARTBEAT_MS || 30000);

const lobbies = new Map();
const sockets = new Map();

const palette = [
  0xffd23f, 0x2f80ed, 0xeb5757, 0x27ae60, 0x9b51e0,
  0xf2994a, 0x56ccf2, 0xbb6bd9, 0xff4fa3, 0x9bd53c,
  0xff7043, 0x5c6bc0, 0x00b894, 0xf2c94c, 0xe056fd,
];

const accentPalette = [
  0x10161d, 0xf7f7ef, 0x111820, 0xfff2a8, 0xf2f2f2,
  0x16202a, 0x102030, 0xfff2a8, 0x10161d, 0x1a1d20,
  0xf7f7ef, 0xf2c94c, 0x10161d, 0x2d3440, 0xf7f7ef,
];

function isPassengerRuntime() {
  return Boolean(process.env.PASSENGER_APP_ENV || process.env.PASSENGER_BASE_URI);
}

function makeId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function makeSessionToken() {
  return `s_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function makeLobbyCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 200; attempt += 1) {
    let code = '';
    for (let i = 0; i < lobbyCodeLength; i += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    if (!lobbies.has(code)) return code;
  }
  return String(Date.now()).slice(-lobbyCodeLength);
}

function safeName(name) {
  const trimmed = String(name || '').trim().slice(0, 16);
  return trimmed || 'Player';
}

function normalizeToken(token) {
  const value = String(token || '').trim();
  return value.length >= 10 ? value : makeSessionToken();
}

function pickLivery(lobby) {
  const usedColors = new Set([...lobby.players.values()].map((player) => player.color));
  const index = palette.findIndex((color) => !usedColors.has(color));
  const paletteIndex = index >= 0 ? index : lobby.players.size % palette.length;
  return {
    color: palette[paletteIndex],
    accent: accentPalette[paletteIndex],
  };
}

function send(ws, type, payload = {}) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type, ...payload }));
}

function broadcast(lobby, type, payload = {}, exceptId = null) {
  for (const player of lobby.players.values()) {
    if (player.id === exceptId) continue;
    send(player.ws, type, payload);
  }
}

function lobbySnapshot(lobby) {
  return {
    code: lobby.code,
    hostId: lobby.hostId,
    state: lobby.state,
    maxPlayers,
    readyCount: [...lobby.players.values()].filter((player) => player.connected && player.ready).length,
    players: [...lobby.players.values()].map((player, index) => ({
      id: player.id,
      name: player.name,
      ready: player.ready,
      connected: player.connected,
      host: player.id === lobby.hostId,
      color: player.color,
      accent: player.accent,
      gridIndex: index,
      lastState: player.lastState,
    })),
  };
}

function broadcastLobby(lobby) {
  broadcast(lobby, 'lobby:update', { lobby: lobbySnapshot(lobby) });
}

function findPlayerBySession(lobby, sessionToken) {
  return [...lobby.players.values()].find((player) => player.sessionToken === sessionToken);
}

function attachPlayerSocket(lobby, player, ws, name = null) {
  if (player.ws && player.ws !== ws) {
    sockets.delete(player.ws);
    try {
      player.ws.close(4000, 'Session resumed elsewhere');
    } catch {
      // The old socket may already be closed during a browser refresh.
    }
  }

  player.ws = ws;
  player.connected = true;
  player.disconnectedAt = 0;
  if (name) player.name = safeName(name);
  sockets.set(ws, { playerId: player.id, lobbyCode: lobby.code });
  send(ws, 'session:joined', {
    playerId: player.id,
    sessionToken: player.sessionToken,
    lobby: lobbySnapshot(lobby),
  });
  broadcastLobby(lobby);
}

function joinLobby(ws, code, name, create = false, requestedToken = null) {
  let lobby = lobbies.get(code);
  const sessionToken = normalizeToken(requestedToken);
  if (!lobby && create) {
    lobby = {
      code,
      hostId: null,
      state: 'lobby',
      players: new Map(),
      createdAt: Date.now(),
    };
    lobbies.set(code, lobby);
  }

  if (!lobby) {
    send(ws, 'lobby:error', { message: 'Lobby introuvable.' });
    return;
  }

  const existingPlayer = findPlayerBySession(lobby, sessionToken);
  if (existingPlayer) {
    attachPlayerSocket(lobby, existingPlayer, ws, name);
    return;
  }

  if (lobby.players.size >= maxPlayers) {
    send(ws, 'lobby:error', { message: 'Lobby plein.' });
    return;
  }
  if (lobby.state !== 'lobby') {
    send(ws, 'lobby:error', { message: 'La course est deja lancee.' });
    return;
  }

  const id = makeId('p');
  const livery = pickLivery(lobby);
  const player = {
    id,
    ws,
    name: safeName(name),
    sessionToken,
    ready: false,
    connected: true,
    disconnectedAt: 0,
    color: livery.color,
    accent: livery.accent,
    lastState: null,
  };
  lobby.players.set(id, player);
  if (!lobby.hostId) lobby.hostId = id;
  sockets.set(ws, { playerId: id, lobbyCode: lobby.code });

  send(ws, 'session:joined', {
    playerId: id,
    sessionToken,
    lobby: lobbySnapshot(lobby),
  });
  broadcastLobby(lobby);
}

function leaveLobby(ws) {
  const session = sockets.get(ws);
  if (!session) return;
  sockets.delete(ws);
  const lobby = lobbies.get(session.lobbyCode);
  if (!lobby) return;

  const player = lobby.players.get(session.playerId);
  if (!player || player.ws !== ws) return;
  player.ws = null;
  player.connected = false;
  player.disconnectedAt = Date.now();
  broadcastLobby(lobby);
}

function handleReady(ws, ready) {
  const session = sockets.get(ws);
  if (!session) return;
  const lobby = lobbies.get(session.lobbyCode);
  const player = lobby && lobby.players.get(session.playerId);
  if (!lobby || !player || lobby.state !== 'lobby') return;
  player.ready = Boolean(ready);
  broadcastLobby(lobby);
}

function handleStart(ws) {
  const session = sockets.get(ws);
  if (!session) return;
  const lobby = lobbies.get(session.lobbyCode);
  if (!lobby || lobby.hostId !== session.playerId || lobby.state !== 'lobby') return;
  const readyCount = [...lobby.players.values()].filter((player) => player.connected && player.ready).length;
  if (readyCount < 2) {
    send(ws, 'lobby:error', { message: 'Il faut au moins 2 joueurs prets.' });
    return;
  }

  lobby.state = 'countdown';
  const startAt = Date.now() + 3600;
  const grid = [...lobby.players.values()].map((player, index) => ({
    id: player.id,
    gridIndex: index,
    color: player.color,
    accent: player.accent,
    name: player.name,
  }));

  broadcastLobby(lobby);
  broadcast(lobby, 'race:start', { startAt, grid });

  setTimeout(() => {
    const current = lobbies.get(lobby.code);
    if (!current || current.state !== 'countdown') return;
    current.state = 'running';
    broadcastLobby(current);
    broadcast(current, 'race:go', { startedAt: Date.now() });
  }, 3600);
}

function handleEndLobby(ws) {
  const session = sockets.get(ws);
  if (!session) return;
  const lobby = lobbies.get(session.lobbyCode);
  if (!lobby || lobby.hostId !== session.playerId) return;
  broadcast(lobby, 'lobby:ended', { code: lobby.code });
  for (const player of lobby.players.values()) {
    if (player.ws) sockets.delete(player.ws);
  }
  lobbies.delete(lobby.code);
}

function handleEndRace(ws) {
  const session = sockets.get(ws);
  if (!session) return;
  const lobby = lobbies.get(session.lobbyCode);
  if (!lobby || lobby.hostId !== session.playerId || lobby.state === 'lobby') return;

  lobby.state = 'lobby';
  for (const player of lobby.players.values()) {
    player.ready = false;
    player.lastState = null;
  }

  const snapshot = lobbySnapshot(lobby);
  broadcast(lobby, 'race:ended', { lobby: snapshot });
  broadcastLobby(lobby);
}

function handleKartState(ws, state) {
  const session = sockets.get(ws);
  if (!session) return;
  const lobby = lobbies.get(session.lobbyCode);
  const player = lobby && lobby.players.get(session.playerId);
  if (!lobby || !player || !state) return;
  player.lastState = {
    id: player.id,
    x: Number(state.x) || 0,
    y: Number(state.y) || 0,
    z: Number(state.z) || 0,
    yaw: Number(state.yaw) || 0,
    speed: Number(state.speed) || 0,
    steering: Number(state.steering) || 0,
    boost: Number(state.boost) || 0,
    drift: Number(state.drift) || 0,
    coins: Number(state.coins) || 0,
    t: Date.now(),
  };
  broadcast(lobby, 'kart:state', { state: player.lastState }, player.id);
}

function handleMessage(ws, raw) {
  let message = null;
  try {
    message = JSON.parse(raw);
  } catch {
    send(ws, 'lobby:error', { message: 'Message reseau invalide.' });
    return;
  }

  if (message.type === 'lobby:create') {
    joinLobby(ws, makeLobbyCode(), message.name, true, message.sessionToken);
  } else if (message.type === 'lobby:join') {
    joinLobby(ws, String(message.code || '').trim().toUpperCase(), message.name, false, message.sessionToken);
  } else if (message.type === 'lobby:reconnect') {
    joinLobby(ws, String(message.code || '').trim().toUpperCase(), message.name, false, message.sessionToken);
  } else if (message.type === 'lobby:ready') {
    handleReady(ws, message.ready);
  } else if (message.type === 'race:start-request') {
    handleStart(ws);
  } else if (message.type === 'lobby:end') {
    handleEndLobby(ws);
  } else if (message.type === 'race:end-request') {
    handleEndRace(ws);
  } else if (message.type === 'kart:state') {
    handleKartState(ws, message.state);
  }
}

function accessHeaders(extra = {}) {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Access-Control-Request-Private-Network',
    'access-control-allow-private-network': 'true',
    ...extra,
  };
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, accessHeaders());
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/health') {
    const connectedPlayers = [...lobbies.values()]
      .flatMap((lobby) => [...lobby.players.values()])
      .filter((player) => player.connected).length;
    res.writeHead(200, accessHeaders({ 'content-type': 'application/json; charset=utf-8' }));
    res.end(JSON.stringify({
      ok: true,
      service: 'kart-race-mmo-server',
      uptime: Math.round(process.uptime()),
      lobbies: lobbies.size,
      connectedPlayers,
      maxPlayers,
    }));
    return;
  }

  res.writeHead(200, accessHeaders({ 'content-type': 'text/plain; charset=utf-8' }));
  res.end('Kart Race MMO server online. Use /health for status.');
});

const wss = new WebSocketServer({ server });
wss.on('headers', (headers) => {
  headers.push('Access-Control-Allow-Origin: *');
  headers.push('Access-Control-Allow-Private-Network: true');
});
wss.on('connection', (ws) => {
  ws.isAlive = true;
  send(ws, 'session:hello', { maxPlayers });
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  ws.on('message', (raw) => handleMessage(ws, raw));
  ws.on('close', () => leaveLobby(ws));
  ws.on('error', () => leaveLobby(ws));
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      leaveLobby(ws);
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, heartbeatMs);

function shutdown() {
  clearInterval(heartbeat);
  for (const ws of wss.clients) ws.close(1001, 'Server shutting down');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (isPassengerRuntime() && !process.env.PORT) {
  server.listen();
} else {
  server.listen(Number(process.env.PORT || 8787));
}
