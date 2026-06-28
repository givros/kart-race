export class MultiplayerClient extends EventTarget {
  static FALLBACK_PUBLIC_SERVER_URL = 'wss://ws.givros-studio.fr';
  constructor() {
    super();
    this.socket = null;
    this.playerId = null;
    this.lobby = null;
    this.connected = false;
    this.connecting = false;
    this.lastError = '';
    this.wsUrl = this.resolveWsUrl();
    this.transport = 'websocket';
    this.httpClientId = null;
    this.httpConnecting = false;
    this.httpPolling = false;
    this.configReady = this.loadServerConfig();
    this.sessionToken = this.getOrCreateSessionToken();
    this.savedLobbyCode = window.localStorage.getItem('kartingLobbyCode') ?? '';
    this.savedName = window.localStorage.getItem('kartingPlayerName') ?? 'Player';
    this.restoring = false;
  }

  resolveWsUrl() {
    const params = new URLSearchParams(window.location.search);
    const explicit = params.get('ws');
    if (explicit) return this.normalizeWsUrl(explicit);
    const configured = import.meta.env.VITE_WS_URL;
    if (configured) return this.normalizeWsUrl(configured);
    if (window.location.hostname.endsWith('github.io')) {
      return MultiplayerClient.FALLBACK_PUBLIC_SERVER_URL;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || '127.0.0.1';
    return `${protocol}//${host}:8787`;
  }

  async loadServerConfig() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('ws') || import.meta.env.VITE_WS_URL) return;

    try {
      const base = `${import.meta.env.BASE_URL ?? '/'}`.endsWith('/')
        ? `${import.meta.env.BASE_URL ?? '/'}`
        : `${import.meta.env.BASE_URL ?? '/'}/`;
      const url = `${base}server.json?t=${Date.now()}`;
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) return;
      const config = await response.json();
      if (config?.wsUrl) this.wsUrl = this.normalizeWsUrl(config.wsUrl);
    } catch {
      // Keep the fallback URL if the public config cannot be loaded.
    }
  }

  normalizeWsUrl(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    if (/^wss?:\/\//i.test(raw)) return raw;
    if (/^https:\/\//i.test(raw)) return raw.replace(/^https:/i, 'wss:');
    if (/^http:\/\//i.test(raw)) return raw.replace(/^http:/i, 'ws:');
    if (raw.startsWith('//')) {
      return `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}${raw}`;
    }
    const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(raw);
    const protocol = window.location.protocol === 'https:' && !isLocal ? 'wss' : 'ws';
    return `${protocol}://${raw}`;
  }

  getOrCreateSessionToken() {
    const existing = window.localStorage.getItem('kartingSessionToken');
    if (existing) return existing;
    const token = `s_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    window.localStorage.setItem('kartingSessionToken', token);
    return token;
  }

  saveSession(lobby, name = null) {
    if (!lobby?.code) return;
    this.savedLobbyCode = lobby.code;
    window.localStorage.setItem('kartingLobbyCode', lobby.code);
    if (name) {
      this.savedName = name;
      window.localStorage.setItem('kartingPlayerName', name);
    }
  }

  clearSavedLobby() {
    this.savedLobbyCode = '';
    window.localStorage.removeItem('kartingLobbyCode');
  }

  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  connect() {
    if (this.connected || this.connecting || this.httpConnecting) return;
    if (this.transport === 'http') {
      this.startHttpTransport();
      return;
    }
    this.connecting = true;
    this.emit('status', { label: 'Connexion...' });

    this.socket = new WebSocket(this.wsUrl);
    let opened = false;
    this.socket.addEventListener('open', () => {
      opened = true;
      this.connected = true;
      this.connecting = false;
      this.emit('status', { label: 'Connecte' });
    });
    this.socket.addEventListener('close', () => {
      if (!opened && this.transport !== 'http') {
        this.startHttpTransport();
        return;
      }
      if (this.transport === 'http' || this.httpConnecting) return;
      this.connected = false;
      this.connecting = false;
      this.emit('status', { label: 'Deconnecte' });
    });
    this.socket.addEventListener('error', () => {
      if (!opened) {
        this.startHttpTransport();
        return;
      }
      this.lastError = 'Connexion serveur impossible.';
      this.emit('error', { message: this.lastError });
    });
    this.socket.addEventListener('message', (event) => this.handleMessage(event.data));
  }

  httpBaseUrl() {
    return this.wsUrl
      .replace(/^wss:/i, 'https:')
      .replace(/^ws:/i, 'http:')
      .replace(/\/$/u, '');
  }

  async startHttpTransport() {
    if (this.connected || this.httpConnecting) return;
    this.transport = 'http';
    this.httpConnecting = true;
    this.connecting = true;
    this.emit('status', { label: 'Connexion HTTP...' });

    try {
      const response = await fetch(`${this.httpBaseUrl()}/connect`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      this.httpClientId = payload.clientId;
      this.connected = true;
      this.connecting = false;
      this.httpConnecting = false;
      this.lastError = '';
      this.emit('status', { label: 'Connecte' });
      this.emit('error', { message: '' });
      this.consumeHttpMessages(payload.messages);
      this.pollHttp();
    } catch {
      this.connected = false;
      this.connecting = false;
      this.httpConnecting = false;
      this.lastError = 'Connexion serveur impossible.';
      this.emit('status', { label: 'Deconnecte' });
      this.emit('error', { message: this.lastError });
    }
  }

  consumeHttpMessages(messages) {
    for (const raw of messages ?? []) {
      this.handleMessage(raw);
    }
  }

  async pollHttp() {
    if (this.httpPolling || this.transport !== 'http' || !this.httpClientId) return;
    this.httpPolling = true;
    while (this.transport === 'http' && this.httpClientId) {
      try {
        const url = `${this.httpBaseUrl()}/poll?clientId=${encodeURIComponent(this.httpClientId)}&t=${Date.now()}`;
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        this.consumeHttpMessages(payload.messages);
      } catch {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
      }
    }
    this.httpPolling = false;
  }

  send(type, payload = {}) {
    this.configReady.then(() => this.sendNow(type, payload));
  }

  sendNow(type, payload = {}) {
    this.connect();
    if (this.transport === 'http') {
      if (!this.connected || !this.httpClientId) {
        window.setTimeout(() => this.sendNow(type, payload), 160);
        return;
      }
      this.sendHttpMessage(type, payload);
      return;
    }
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      window.setTimeout(() => this.sendNow(type, payload), 120);
      return;
    }
    this.socket.send(JSON.stringify({ type, ...payload }));
  }

  async sendHttpMessage(type, payload = {}) {
    try {
      const response = await fetch(`${this.httpBaseUrl()}/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientId: this.httpClientId,
          message: { type, ...payload },
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch {
      this.connected = false;
      this.lastError = 'Connexion serveur impossible.';
      this.emit('status', { label: 'Deconnecte' });
      this.emit('error', { message: this.lastError });
    }
  }

  createLobby(name) {
    this.savedName = name || this.savedName;
    window.localStorage.setItem('kartingPlayerName', this.savedName);
    this.send('lobby:create', { name, sessionToken: this.sessionToken });
  }

  joinLobby(code, name) {
    const normalizedCode = String(code ?? '').trim().toUpperCase();
    this.savedName = name || this.savedName;
    window.localStorage.setItem('kartingPlayerName', this.savedName);
    this.saveSession({ code: normalizedCode }, name);
    this.send('lobby:join', { code: normalizedCode, name, sessionToken: this.sessionToken });
  }

  restoreSession() {
    if (!this.savedLobbyCode || !this.sessionToken) return false;
    this.restoring = true;
    this.send('lobby:reconnect', {
      code: this.savedLobbyCode,
      name: this.savedName,
      sessionToken: this.sessionToken,
    });
    return true;
  }

  setReady(ready) {
    this.send('lobby:ready', { ready });
  }

  requestStart() {
    this.send('race:start-request');
  }

  endLobby() {
    this.send('lobby:end');
  }

  endRace() {
    this.send('race:end-request');
  }

  sendKartState(state) {
    if (!this.connected || !this.lobby) return;
    this.send('kart:state', { state });
  }

  handleMessage(raw) {
    let message = null;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    if (message.type === 'session:joined') {
      this.playerId = message.playerId;
      if (message.sessionToken) {
        this.sessionToken = message.sessionToken;
        window.localStorage.setItem('kartingSessionToken', this.sessionToken);
      }
      this.lobby = message.lobby;
      this.saveSession(this.lobby);
      this.restoring = false;
      this.emit('joined', { playerId: this.playerId, lobby: this.lobby });
    } else if (message.type === 'lobby:update') {
      this.lobby = message.lobby;
      this.saveSession(this.lobby);
      this.emit('lobby', { lobby: this.lobby });
    } else if (message.type === 'lobby:error') {
      this.lastError = message.message;
      if (this.restoring) {
        this.restoring = false;
        this.clearSavedLobby();
      }
      this.emit('error', { message: message.message });
    } else if (message.type === 'lobby:ended') {
      this.clearSavedLobby();
      this.lobby = null;
      this.playerId = null;
      this.emit('lobbyEnded', { code: message.code });
    } else if (message.type === 'race:ended') {
      this.lobby = message.lobby;
      this.saveSession(this.lobby);
      this.emit('raceEnded', { lobby: this.lobby });
    } else if (message.type === 'race:start') {
      this.emit('raceStart', {
        startAt: message.startAt,
        grid: message.grid ?? [],
      });
    } else if (message.type === 'race:go') {
      this.emit('raceGo', { startedAt: message.startedAt });
    } else if (message.type === 'kart:state') {
      this.emit('kartState', { state: message.state });
    } else if (message.type === 'player:left') {
      this.emit('playerLeft', { playerId: message.playerId });
    }
  }
}
