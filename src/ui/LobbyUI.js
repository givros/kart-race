export class LobbyUI {
  constructor(callbacks) {
    this.callbacks = callbacks;
    this.lobby = null;
    this.playerId = null;
    this.ready = false;
    this.status = 'Offline';
    this.error = '';

    this.root = document.createElement('div');
    this.root.className = 'lobby-ui';
    document.body.appendChild(this.root);
    this.root.innerHTML = `
      <section class="lobby-panel">
        <div class="lobby-brand">
          <span>ARCADE KART</span>
          <strong>MULTI RACE</strong>
        </div>
        <div class="lobby-actions" data-entry>
          <label>
            <span>Pseudo</span>
            <input data-name maxlength="16" value="Player" autocomplete="off" spellcheck="false" />
          </label>
          <div class="join-row">
            <label>
              <span>Code lobby</span>
              <input data-code maxlength="5" placeholder="A7K9Q" autocomplete="off" autocapitalize="characters" spellcheck="false" />
            </label>
            <button type="button" data-join>Join</button>
          </div>
          <button type="button" data-create>Create lobby</button>
          <button type="button" data-solo>Solo test</button>
        </div>
        <div class="lobby-room" data-room hidden>
          <div class="room-topline">
            <span>CODE</span>
            <strong data-room-code>-----</strong>
          </div>
          <div class="room-status" data-room-status>Waiting...</div>
          <div class="player-list" data-players></div>
          <div class="room-actions">
            <button type="button" data-ready>Ready</button>
            <button type="button" data-start>Start race</button>
            <button type="button" data-end>End lobby</button>
          </div>
        </div>
        <p class="lobby-error" data-error></p>
        <p class="lobby-network" data-status>Offline</p>
        <p class="lobby-credits">Assets par <a href="https://www.kenney.nl/" target="_blank" rel="noopener noreferrer">Kenney</a></p>
      </section>
      <div class="lobby-race-badge" data-badge hidden>
        <span data-badge-code></span>
        <strong data-badge-count></strong>
      </div>
    `;
    this.addStyles();
    this.refs = {
      panel: this.root.querySelector('.lobby-panel'),
      entry: this.root.querySelector('[data-entry]'),
      room: this.root.querySelector('[data-room]'),
      name: this.root.querySelector('[data-name]'),
      code: this.root.querySelector('[data-code]'),
      create: this.root.querySelector('[data-create]'),
      join: this.root.querySelector('[data-join]'),
      solo: this.root.querySelector('[data-solo]'),
      ready: this.root.querySelector('[data-ready]'),
      start: this.root.querySelector('[data-start]'),
      end: this.root.querySelector('[data-end]'),
      roomCode: this.root.querySelector('[data-room-code]'),
      roomStatus: this.root.querySelector('[data-room-status]'),
      players: this.root.querySelector('[data-players]'),
      error: this.root.querySelector('[data-error]'),
      status: this.root.querySelector('[data-status]'),
      badge: this.root.querySelector('[data-badge]'),
      badgeCode: this.root.querySelector('[data-badge-code]'),
      badgeCount: this.root.querySelector('[data-badge-count]'),
    };
    this.bind();
    this.render();
  }

  addStyles() {
    if (document.getElementById('lobby-ui-style')) return;
    const style = document.createElement('style');
    style.id = 'lobby-ui-style';
    style.textContent = `
      .lobby-ui {
        position: fixed;
        inset: 0;
        z-index: 12;
        pointer-events: none;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #f8fbff;
      }

      .lobby-ui [hidden] {
        display: none !important;
      }

      .lobby-panel {
        position: absolute;
        left: 18px;
        top: 150px;
        width: min(360px, calc(100vw - 36px));
        pointer-events: auto;
        border: 1px solid rgba(255, 255, 255, 0.28);
        border-radius: 8px;
        background: rgba(14, 20, 28, 0.84);
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.34);
        backdrop-filter: blur(12px);
        overflow: hidden;
      }

      .lobby-ui.is-racing .lobby-panel {
        display: none;
      }

      .lobby-brand {
        display: grid;
        gap: 2px;
        padding: 14px 16px;
        background: linear-gradient(135deg, #ffca3a, #ff6b35);
        color: #111820;
      }

      .lobby-brand span,
      .lobby-network,
      .lobby-error,
      .lobby-credits,
      .room-topline span,
      .room-status,
      .player-row span,
      .lobby-actions label span {
        letter-spacing: 0;
        font-size: 11px;
        font-weight: 900;
      }

      .lobby-brand strong {
        font-size: 24px;
        line-height: 1;
        font-weight: 1000;
      }

      .lobby-actions,
      .lobby-room {
        display: grid;
        gap: 10px;
        padding: 14px;
      }

      .lobby-actions label {
        display: grid;
        gap: 5px;
      }

      .join-row {
        display: grid;
        grid-template-columns: 1fr 84px;
        gap: 8px;
        align-items: end;
      }

      .lobby-ui input {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid rgba(255, 255, 255, 0.24);
        border-radius: 8px;
        padding: 10px 11px;
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
        font-weight: 900;
        text-transform: uppercase;
        outline: none;
      }

      .lobby-ui input:focus {
        border-color: #ffca3a;
        box-shadow: 0 0 0 3px rgba(255, 202, 58, 0.18);
      }

      .lobby-ui button {
        border: 0;
        border-radius: 8px;
        padding: 11px 12px;
        background: #ffca3a;
        color: #121820;
        font-weight: 1000;
        cursor: pointer;
        box-shadow: inset 0 -5px 0 rgba(0, 0, 0, 0.17);
      }

      .lobby-ui button[data-solo] {
        background: rgba(255, 255, 255, 0.14);
        color: #f8fbff;
      }

      .lobby-ui button:disabled {
        cursor: default;
        opacity: 0.42;
      }

      .room-topline {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .room-topline strong {
        padding: 7px 10px;
        border-radius: 8px;
        background: #f8fbff;
        color: #111820;
        font-size: 22px;
        letter-spacing: 0;
      }

      .room-status {
        color: rgba(248, 251, 255, 0.74);
      }

      .player-list {
        display: grid;
        gap: 6px;
        max-height: 258px;
        overflow: auto;
      }

      .player-row {
        display: grid;
        grid-template-columns: 14px 1fr auto;
        align-items: center;
        gap: 8px;
        padding: 8px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.08);
      }

      .player-row.is-offline {
        opacity: 0.5;
      }

      .player-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: var(--player-color);
        box-shadow: 0 0 12px var(--player-color);
      }

      .player-row strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .player-row em {
        color: #ffca3a;
        font-style: normal;
        font-size: 11px;
        font-weight: 1000;
      }

      .room-actions {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 8px;
      }

      .lobby-ui button[data-end] {
        background: #ff5656;
        color: #fff;
      }

      .lobby-error,
      .lobby-network,
      .lobby-credits {
        margin: 0;
        min-height: 14px;
      }

      .lobby-error,
      .lobby-network {
        padding: 0 14px 12px;
      }

      .lobby-error {
        color: #ff8d8d;
      }

      .lobby-network {
        color: rgba(248, 251, 255, 0.56);
      }

      .lobby-credits {
        padding: 0 14px 14px;
        color: rgba(248, 251, 255, 0.48);
      }

      .lobby-credits a {
        color: #ffca3a;
        text-decoration: none;
      }

      .lobby-credits a:hover {
        text-decoration: underline;
      }

      .lobby-race-badge {
        position: absolute;
        left: 16px;
        top: 132px;
        transform: none;
        display: flex;
        gap: 10px;
        align-items: center;
        padding: 9px 12px;
        border: 1px solid rgba(255, 255, 255, 0.24);
        border-radius: 8px;
        background: rgba(14, 20, 28, 0.72);
        box-shadow: 0 12px 34px rgba(0, 0, 0, 0.25);
      }

      .lobby-race-badge span {
        color: #ffca3a;
        font-weight: 1000;
      }

      .lobby-race-badge strong {
        font-size: 12px;
      }

      @media (max-width: 760px) {
        .lobby-panel {
          left: 10px;
          top: 148px;
        }

        .lobby-race-badge {
          left: 10px;
          top: 104px;
          max-width: calc(100vw - 136px);
          overflow: hidden;
        }

        .lobby-race-badge span,
        .lobby-race-badge strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }
    `;
    document.head.appendChild(style);
  }

  bind() {
    this.refs.create.addEventListener('click', () => {
      this.error = '';
      this.callbacks.onCreate(this.refs.name.value);
      this.render();
    });
    this.refs.join.addEventListener('click', () => {
      this.error = '';
      this.callbacks.onJoin(this.refs.code.value, this.refs.name.value);
      this.render();
    });
    this.refs.solo.addEventListener('click', () => {
      this.callbacks.onSolo();
      this.root.classList.add('is-racing');
    });
    this.refs.ready.addEventListener('click', () => {
      this.ready = !this.ready;
      this.callbacks.onReady(this.ready);
      this.render();
    });
    this.refs.start.addEventListener('click', () => {
      this.callbacks.onStart();
    });
    this.refs.end.addEventListener('click', () => {
      this.callbacks.onEnd();
    });
    this.refs.code.addEventListener('input', () => {
      this.refs.code.value = this.refs.code.value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 5);
    });
  }

  setStatus(label) {
    this.status = label;
    this.render();
  }

  setError(message) {
    this.error = message ?? '';
    this.render();
  }

  updateLobby(lobby, playerId) {
    this.lobby = lobby;
    this.playerId = playerId ?? this.playerId;
    const me = lobby?.players?.find((player) => player.id === this.playerId);
    this.ready = Boolean(me?.ready);
    this.render();
  }

  showRaceBadge() {
    this.root.classList.add('is-racing');
    this.refs.panel.hidden = true;
    this.render();
  }

  showLobbyPanel() {
    this.root.classList.remove('is-racing');
    this.refs.panel.hidden = false;
    this.render();
  }

  resetToMenu(message = '') {
    this.lobby = null;
    this.playerId = null;
    this.ready = false;
    this.error = message;
    this.root.classList.remove('is-racing');
    this.refs.panel.hidden = false;
    this.render();
  }

  render() {
    const inLobby = Boolean(this.lobby);
    const isRacing = this.root.classList.contains('is-racing');
    this.refs.panel.hidden = isRacing;
    this.refs.entry.hidden = inLobby;
    this.refs.room.hidden = !inLobby;
    this.refs.error.textContent = this.error;
    this.refs.status.textContent = this.status;

    if (!this.lobby) {
      this.refs.badge.hidden = true;
      return;
    }

    const players = this.lobby.players ?? [];
    const me = players.find((player) => player.id === this.playerId);
    const isHost = Boolean(me?.host);
    const readyCount = players.filter((player) => player.connected && player.ready).length;
    this.refs.roomCode.textContent = this.lobby.code;
    this.refs.roomStatus.textContent = `${players.length} / ${this.lobby.maxPlayers} joueurs - ${readyCount} prets`;
    this.refs.players.innerHTML = players
      .map((player) => `
        <div class="player-row ${player.connected ? '' : 'is-offline'}" style="--player-color:#${Number(player.color ?? 0xffffff).toString(16).padStart(6, '0')}">
          <i class="player-dot"></i>
          <strong>${this.escape(player.name)}${player.id === this.playerId ? ' (you)' : ''}</strong>
          <em>${!player.connected ? 'OFFLINE' : player.host ? 'HOST' : player.ready ? 'READY' : 'WAIT'}</em>
        </div>
      `)
      .join('');
    this.refs.ready.textContent = this.ready ? 'Not ready' : 'Ready';
    this.refs.start.disabled = !isHost || readyCount < 2;
    this.refs.start.textContent = isHost ? 'Start race' : 'Host only';
    this.refs.end.disabled = !isHost;
    this.refs.end.textContent = isHost ? 'End lobby' : 'Host only';
    this.refs.badge.hidden = !isRacing;
    this.refs.badgeCode.textContent = `Lobby ${this.lobby.code}`;
    this.refs.badgeCount.textContent = `${players.length} racers`;
  }

  escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
  }
}
