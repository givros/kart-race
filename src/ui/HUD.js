import { formatRaceTime } from '../utils/math.js';

const REEL_SYMBOLS = ['>>', '3X', 'RK', 'LK', 'MN', 'HN', 'ST', '$'];
const HUD_ONLY_EVENT_TYPES = new Set(['roulette', 'itemReady', 'itemUse']);
const GLYPH_KINDS = new Set([
  'turbo',
  'tripleTurbo',
  'rocket',
  'seeker',
  'skidMine',
  'pulse',
  'storm',
  'star',
  'leaderDrone',
  'coinBurst',
]);

function colorToCss(color) {
  if (typeof color === 'string') return color;
  return `#${(color ?? 0xffffff).toString(16).padStart(6, '0')}`;
}

export class HUD {
  constructor(callbacks = {}) {
    const normalizedCallbacks = typeof callbacks === 'function'
      ? { onRestart: callbacks }
      : callbacks;
    this.onRestart = normalizedCallbacks.onRestart ?? (() => {});
    this.onEndRace = normalizedCallbacks.onEndRace ?? (() => {});
    this.eventFeed = [];
    this.lastFlashAt = 0;
    this.raceMenuOpen = false;
    this.endRaceConfirmOpen = false;
    this.raceControls = {
      visible: false,
      canEndRace: false,
      endLabel: 'Retour lobby',
      hint: '',
      confirmTitle: 'Fin de course',
      confirmCopy: 'Terminer la course et revenir au lobby ?',
    };
    this.root = document.createElement('div');
    this.root.className = 'kart-hud';
    document.body.appendChild(this.root);
    this.root.innerHTML = `
      <div class="hud-race-card">
        <div class="hud-position">
          <span>POS</span>
          <strong data-position>1</strong>
          <em data-total>/8</em>
        </div>
        <div class="hud-race-meta">
          <div><span>LAP</span><strong data-lap>1/3</strong></div>
          <div><span>TIME</span><strong data-time>0:00.000</strong></div>
          <div><span>BEST</span><strong data-best>--</strong></div>
        </div>
      </div>

      <div class="hud-item-slot" data-item-slot>
        <div class="hud-item-orbit"></div>
        <div class="hud-item-core" data-item-core>
          <div class="hud-item-reel" data-item-reel></div>
          <i class="hud-item-glyph" data-item-glyph></i>
          <strong data-item-icon>-</strong>
        </div>
        <div class="hud-item-label">
          <span data-item-state>EMPTY</span>
          <strong data-item>NO ITEM</strong>
          <em data-item-hint></em>
        </div>
      </div>

      <div class="hud-meter-card">
        <div class="hud-speed">
          <strong data-speed>0</strong>
          <span>KM/H</span>
        </div>
        <div class="hud-coins">
          <span>COINS</span>
          <strong data-coins>0</strong>
          <div class="coin-pips" data-coin-pips></div>
        </div>
      </div>

      <div class="hud-race-options" data-race-options hidden>
        <button class="hud-gear-button" type="button" data-race-menu-toggle aria-label="Options course" title="Options course">⚙</button>
        <div class="hud-race-menu" data-race-menu hidden>
          <strong>Course</strong>
          <p data-race-menu-hint></p>
          <button type="button" data-end-race>Retour lobby</button>
          <button class="is-ghost" type="button" data-close-race-menu>Reprendre</button>
        </div>
      </div>

      <div class="hud-end-confirm" data-end-confirm hidden>
        <div class="end-confirm-panel">
          <strong data-end-confirm-title>Fin de course</strong>
          <p data-end-confirm-copy>Terminer la course et revenir au lobby ?</p>
          <div>
            <button type="button" data-confirm-end-race>Retour lobby</button>
            <button class="is-ghost" type="button" data-cancel-end-race>Annuler</button>
          </div>
        </div>
      </div>

      <div class="hud-event-stage" data-event-stage></div>
      <div class="hud-screen-flash" data-screen-flash></div>
      <div class="hud-wrong-way" data-wrong-way>
        <strong>MAUVAIS SENS</strong>
        <span data-wrong-way-timer>REMISE EN PISTE DANS 5.0S</span>
        <i data-wrong-way-bar></i>
      </div>
      <div class="hud-countdown" data-countdown></div>

      <div class="hud-result" data-result hidden>
        <div class="result-panel">
          <h1 data-result-title>Race Complete</h1>
          <p data-result-summary></p>
          <ol class="result-ranking" data-result-ranking></ol>
          <button type="button" data-restart>Restart Race</button>
        </div>
      </div>
    `;
    this.addStyles();
    this.refs = {
      lap: this.root.querySelector('[data-lap]'),
      position: this.root.querySelector('[data-position]'),
      total: this.root.querySelector('[data-total]'),
      time: this.root.querySelector('[data-time]'),
      best: this.root.querySelector('[data-best]'),
      item: this.root.querySelector('[data-item]'),
      itemIcon: this.root.querySelector('[data-item-icon]'),
      itemCore: this.root.querySelector('[data-item-core]'),
      itemGlyph: this.root.querySelector('[data-item-glyph]'),
      itemReel: this.root.querySelector('[data-item-reel]'),
      itemSlot: this.root.querySelector('[data-item-slot]'),
      itemState: this.root.querySelector('[data-item-state]'),
      itemHint: this.root.querySelector('[data-item-hint]'),
      coins: this.root.querySelector('[data-coins]'),
      coinPips: this.root.querySelector('[data-coin-pips]'),
      speed: this.root.querySelector('[data-speed]'),
      speedCard: this.root.querySelector('.hud-meter-card'),
      raceOptions: this.root.querySelector('[data-race-options]'),
      raceMenuToggle: this.root.querySelector('[data-race-menu-toggle]'),
      raceMenu: this.root.querySelector('[data-race-menu]'),
      raceMenuHint: this.root.querySelector('[data-race-menu-hint]'),
      endRace: this.root.querySelector('[data-end-race]'),
      closeRaceMenu: this.root.querySelector('[data-close-race-menu]'),
      endConfirm: this.root.querySelector('[data-end-confirm]'),
      endConfirmTitle: this.root.querySelector('[data-end-confirm-title]'),
      endConfirmCopy: this.root.querySelector('[data-end-confirm-copy]'),
      confirmEndRace: this.root.querySelector('[data-confirm-end-race]'),
      cancelEndRace: this.root.querySelector('[data-cancel-end-race]'),
      countdown: this.root.querySelector('[data-countdown]'),
      eventStage: this.root.querySelector('[data-event-stage]'),
      screenFlash: this.root.querySelector('[data-screen-flash]'),
      wrongWay: this.root.querySelector('[data-wrong-way]'),
      wrongWayTimer: this.root.querySelector('[data-wrong-way-timer]'),
      wrongWayBar: this.root.querySelector('[data-wrong-way-bar]'),
      result: this.root.querySelector('[data-result]'),
      resultTitle: this.root.querySelector('[data-result-title]'),
      resultSummary: this.root.querySelector('[data-result-summary]'),
      resultRanking: this.root.querySelector('[data-result-ranking]'),
      restart: this.root.querySelector('[data-restart]'),
    };
    this.refs.itemReel.innerHTML = REEL_SYMBOLS
      .map((symbol) => `<i>${symbol}</i>`)
      .join('');
    this.refs.restart.addEventListener('click', () => this.onRestart());
    this.refs.raceMenuToggle.addEventListener('click', () => this.toggleRaceMenu());
    this.refs.closeRaceMenu.addEventListener('click', () => this.closeRaceMenu());
    this.refs.endRace.addEventListener('click', () => this.openEndRaceConfirm());
    this.refs.cancelEndRace.addEventListener('click', () => this.closeEndRaceConfirm());
    this.refs.confirmEndRace.addEventListener('click', () => {
      this.closeRaceMenu();
      this.onEndRace();
    });
  }

  addStyles() {
    if (document.getElementById('kart-hud-style')) return;
    const style = document.createElement('style');
    style.id = 'kart-hud-style';
    style.textContent = `
      :root {
        --hud-ink: #f9fbff;
        --hud-dark: rgba(10, 15, 22, 0.82);
        --hud-panel: rgba(25, 35, 46, 0.84);
        --hud-line: rgba(255, 255, 255, 0.26);
        --hud-yellow: #ffd447;
        --hud-cyan: #39d8ff;
        --hud-red: #ff4f5f;
        --hud-green: #58e171;
        --hud-track: rgba(255, 255, 255, 0.08);
      }

      .kart-hud {
        position: fixed;
        inset: 0;
        color: var(--hud-ink);
        pointer-events: none;
        z-index: 10;
        text-shadow: 0 2px 5px rgba(0, 0, 0, 0.42);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .kart-hud [hidden] {
        display: none !important;
      }

      .hud-race-card,
      .hud-item-slot,
      .hud-meter-card {
        position: absolute;
        border: 1px solid var(--hud-line);
        border-radius: 8px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.08), transparent 38%),
          var(--hud-dark);
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(10px);
        overflow: hidden;
      }

      .hud-race-card::before,
      .hud-meter-card::before {
        content: "";
        position: absolute;
        inset: 0;
        border-top: 3px solid var(--hud-yellow);
        pointer-events: none;
      }

      .hud-race-card {
        top: 16px;
        left: 16px;
        display: grid;
        grid-template-columns: 92px 190px;
        gap: 10px;
        padding: 12px;
      }

      .hud-position {
        min-height: 82px;
        display: grid;
        place-items: center;
        border-radius: 8px;
        background: linear-gradient(145deg, var(--hud-yellow), #ff8d2f);
        color: #121820;
        text-shadow: none;
        box-shadow: inset 0 -7px 0 rgba(0, 0, 0, 0.16);
      }

      .hud-position span,
      .hud-position em {
        font-size: 11px;
        font-weight: 1000;
        font-style: normal;
      }

      .hud-position strong {
        margin-top: -8px;
        margin-bottom: -10px;
        font-size: 46px;
        line-height: 0.95;
        font-weight: 1000;
      }

      .hud-race-meta {
        display: grid;
        gap: 6px;
        align-content: center;
      }

      .hud-race-meta div {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 25px;
        padding: 4px 7px;
        border-radius: 6px;
        background: var(--hud-track);
      }

      .hud-coins {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: 8px 12px;
      }

      .hud-race-meta span,
      .hud-coins span,
      .hud-speed span,
      .hud-item-label span {
        color: rgba(235, 244, 255, 0.7);
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0;
      }

      .hud-race-meta strong,
      .hud-coins strong {
        font-variant-numeric: tabular-nums;
        font-size: 14px;
      }

      .hud-item-slot {
        top: 16px;
        left: 50%;
        width: min(360px, calc(100vw - 360px));
        min-width: 320px;
        min-height: 82px;
        transform: translateX(-50%) translateY(-18px) scale(0.92);
        display: grid;
        grid-template-columns: 98px minmax(0, 1fr);
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        overflow: hidden;
        opacity: 0;
        visibility: hidden;
        transition: opacity 160ms ease, visibility 160ms ease, transform 160ms ease;
      }

      .hud-item-slot.is-visible {
        opacity: 1;
        visibility: visible;
        transform: translateX(-50%) translateY(0) scale(1);
      }

      .hud-item-orbit {
        position: absolute;
        inset: -24px;
        opacity: 0.42;
        background:
          conic-gradient(from 90deg, transparent, rgba(57, 216, 255, 0.35), transparent 34%, rgba(255, 212, 71, 0.38), transparent 70%);
        animation: itemOrbit 2.4s linear infinite;
      }

      .hud-item-core {
        position: relative;
        width: 92px;
        height: 76px;
        display: grid;
        place-items: center;
        border-radius: 8px;
        background: #6f7b84;
        color: #111820;
        text-shadow: none;
        border: 4px solid rgba(255, 255, 255, 0.28);
        box-shadow: inset 0 -8px 0 rgba(0, 0, 0, 0.2), 0 0 0 4px rgba(255, 255, 255, 0.12);
        overflow: hidden;
      }

      .hud-item-core::before {
        content: "";
        position: absolute;
        left: 9px;
        right: 9px;
        top: 7px;
        height: 14px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.36);
        z-index: 1;
      }

      .hud-item-core strong {
        position: relative;
        z-index: 3;
        max-width: 88px;
        overflow-wrap: anywhere;
        text-align: center;
        font-size: 16px;
        line-height: 0.95;
        font-weight: 1000;
        transition: opacity 120ms ease;
      }

      .hud-item-reel {
        position: absolute;
        inset: 7px;
        z-index: 4;
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 4px;
        opacity: 0;
        transform: translateY(16px);
        transition: opacity 120ms ease;
      }

      .hud-item-reel i {
        display: grid;
        place-items: center;
        border-radius: 5px;
        background: rgba(255, 255, 255, 0.92);
        color: #111820;
        text-shadow: none;
        font-size: 10px;
        line-height: 1;
        font-style: normal;
        font-weight: 1000;
        box-shadow: inset 0 -4px 0 rgba(0, 0, 0, 0.16);
      }

      .hud-item-slot.is-rolling .hud-item-reel {
        opacity: 1;
        animation: itemReelSpin 360ms steps(4, end) infinite;
      }

      .hud-item-slot.is-rolling .hud-item-core strong {
        opacity: 0;
      }

      .hud-item-core.has-glyph strong {
        opacity: 0;
      }

      .hud-item-glyph {
        position: absolute;
        inset: 11px;
        z-index: 2;
        display: none;
        pointer-events: none;
      }

      .hud-item-core.has-glyph .hud-item-glyph {
        display: block;
      }

      .hud-item-glyph::before,
      .hud-item-glyph::after {
        content: "";
        position: absolute;
        display: block;
      }

      .hud-item-glyph[data-kind="turbo"]::before,
      .hud-item-glyph[data-kind="tripleTurbo"]::before {
        left: 7px;
        top: 16px;
        width: 52px;
        height: 28px;
        background: #111820;
        clip-path: polygon(0 0, 52% 0, 100% 50%, 52% 100%, 0 100%, 34% 50%);
      }

      .hud-item-glyph[data-kind="tripleTurbo"]::after {
        left: 26px;
        top: 16px;
        width: 38px;
        height: 28px;
        background: rgba(17, 24, 32, 0.65);
        clip-path: polygon(0 0, 52% 0, 100% 50%, 52% 100%, 0 100%, 34% 50%);
      }

      .hud-item-glyph[data-kind="rocket"]::before,
      .hud-item-glyph[data-kind="leaderDrone"]::before {
        left: 24px;
        top: 6px;
        width: 24px;
        height: 48px;
        border-radius: 16px 16px 7px 7px;
        background: #111820;
        transform: rotate(38deg);
      }

      .hud-item-glyph[data-kind="rocket"]::after,
      .hud-item-glyph[data-kind="leaderDrone"]::after {
        left: 12px;
        bottom: 2px;
        width: 24px;
        height: 14px;
        background: #ffffff;
        clip-path: polygon(0 0, 100% 0, 50% 100%);
        transform: rotate(38deg);
      }

      .hud-item-glyph[data-kind="seeker"]::before {
        left: 12px;
        top: 10px;
        width: 42px;
        height: 42px;
        border: 8px solid #111820;
        border-radius: 50%;
        box-sizing: border-box;
      }

      .hud-item-glyph[data-kind="seeker"]::after {
        left: 29px;
        top: 27px;
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: #111820;
      }

      .hud-item-glyph[data-kind="skidMine"]::before {
        left: 14px;
        top: 14px;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: #111820;
        box-shadow:
          0 -10px 0 -4px #111820,
          0 10px 0 -4px #111820,
          -10px 0 0 -4px #111820,
          10px 0 0 -4px #111820;
      }

      .hud-item-glyph[data-kind="skidMine"]::after {
        left: 28px;
        top: 24px;
        width: 11px;
        height: 11px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.86);
      }

      .hud-item-glyph[data-kind="pulse"]::before {
        left: 6px;
        top: 6px;
        width: 54px;
        height: 54px;
        border: 6px solid #111820;
        border-radius: 50%;
        box-sizing: border-box;
      }

      .hud-item-glyph[data-kind="pulse"]::after {
        left: 22px;
        top: 22px;
        width: 22px;
        height: 22px;
        border: 6px solid #111820;
        border-radius: 50%;
        box-sizing: border-box;
      }

      .hud-item-glyph[data-kind="storm"]::before {
        left: 20px;
        top: 4px;
        width: 31px;
        height: 58px;
        background: #111820;
        clip-path: polygon(42% 0, 100% 0, 62% 38%, 100% 38%, 24% 100%, 42% 54%, 0 54%);
      }

      .hud-item-glyph[data-kind="star"]::before {
        left: 7px;
        top: 4px;
        width: 56px;
        height: 56px;
        background: #111820;
        clip-path: polygon(50% 0, 61% 34%, 98% 34%, 68% 55%, 80% 92%, 50% 70%, 20% 92%, 32% 55%, 2% 34%, 39% 34%);
      }

      .hud-item-glyph[data-kind="coinBurst"]::before {
        left: 14px;
        top: 11px;
        width: 33px;
        height: 44px;
        border-radius: 50%;
        background: #111820;
        box-shadow: 12px 5px 0 rgba(17, 24, 32, 0.78), 24px 10px 0 rgba(17, 24, 32, 0.56);
      }

      .hud-item-glyph[data-kind="coinBurst"]::after {
        left: 26px;
        top: 20px;
        width: 8px;
        height: 27px;
        background: rgba(255, 255, 255, 0.66);
      }

      .hud-item-slot.is-rolling .hud-item-core {
        animation: itemCoreRoll 100ms steps(2, end) infinite, itemSlotPulse 500ms ease-in-out infinite alternate;
      }

      .hud-item-slot.is-ready .hud-item-core {
        animation: none;
      }

      .hud-item-label {
        position: relative;
        min-width: 0;
      }

      .hud-item-label strong {
        display: block;
        margin-top: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 20px;
        line-height: 1.05;
        font-weight: 1000;
      }

      .hud-item-label em {
        display: block;
        margin-top: 5px;
        color: #ffdf63;
        font-size: 11px;
        line-height: 1.1;
        font-style: normal;
        font-weight: 1000;
        text-shadow: none;
      }

      .hud-meter-card {
        top: 16px;
        right: 16px;
        width: 164px;
        padding: 12px;
      }

      .hud-speed {
        display: grid;
        justify-items: end;
        padding: 12px 12px 9px;
        border-radius: 8px;
        background: linear-gradient(145deg, var(--hud-yellow), #ff9c31);
        color: #111820;
        text-shadow: none;
        box-shadow: inset 0 -7px 0 rgba(0, 0, 0, 0.15);
        transition: transform 140ms ease;
      }

      .hud-meter-card.is-boosting .hud-speed {
        transform: scale(1.04);
        background: linear-gradient(145deg, #ff7c32, #ffdd45);
      }

      .hud-speed strong {
        font-size: 44px;
        line-height: 0.9;
        font-weight: 1000;
        font-variant-numeric: tabular-nums;
      }

      .hud-speed span {
        color: #111820;
      }

      .hud-coins {
        margin-top: 10px;
        padding: 9px 8px 8px;
        border-radius: 8px;
        background: var(--hud-track);
      }

      .coin-pips {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 3px;
        width: 100%;
        margin-top: 0;
      }

      .hud-race-options {
        position: absolute;
        top: 164px;
        right: 16px;
        z-index: 4;
        pointer-events: auto;
      }

      .hud-gear-button {
        width: 46px;
        height: 46px;
        display: grid;
        place-items: center;
        border: 1px solid rgba(255, 255, 255, 0.28);
        border-radius: 8px;
        background: rgba(14, 20, 28, 0.78);
        color: #f8fbff;
        cursor: pointer;
        font-size: 24px;
        line-height: 1;
        text-shadow: 0 2px 5px rgba(0, 0, 0, 0.42);
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.24), inset 0 -5px 0 rgba(0, 0, 0, 0.2);
        backdrop-filter: blur(10px);
      }

      .hud-gear-button:hover,
      .hud-gear-button:focus-visible {
        outline: none;
        border-color: rgba(255, 202, 58, 0.78);
        transform: translateY(-1px);
      }

      .hud-race-menu {
        position: absolute;
        top: 54px;
        right: 0;
        width: 228px;
        display: grid;
        gap: 9px;
        padding: 12px;
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 8px;
        background: rgba(14, 20, 28, 0.88);
        box-shadow: 0 18px 54px rgba(0, 0, 0, 0.34);
        backdrop-filter: blur(12px);
      }

      .hud-race-menu strong {
        font-size: 14px;
        line-height: 1;
        font-weight: 1000;
      }

      .hud-race-menu p {
        margin: 0;
        color: rgba(248, 251, 255, 0.72);
        font-size: 11px;
        line-height: 1.25;
        font-weight: 800;
        text-shadow: none;
      }

      .hud-race-menu button,
      .end-confirm-panel button {
        border: 0;
        border-radius: 8px;
        padding: 10px 12px;
        background: #ffca3a;
        color: #121820;
        cursor: pointer;
        font-weight: 1000;
        box-shadow: inset 0 -5px 0 rgba(0, 0, 0, 0.16);
      }

      .hud-race-menu button:disabled {
        cursor: default;
        opacity: 0.48;
      }

      .hud-race-menu button.is-ghost,
      .end-confirm-panel button.is-ghost {
        background: rgba(255, 255, 255, 0.14);
        color: #f8fbff;
      }

      .hud-end-confirm {
        position: fixed;
        inset: 0;
        z-index: 5;
        display: grid;
        place-items: center;
        pointer-events: auto;
        background: rgba(5, 8, 12, 0.38);
      }

      .end-confirm-panel {
        width: min(340px, calc(100vw - 36px));
        display: grid;
        gap: 10px;
        padding: 18px;
        border: 1px solid rgba(255, 255, 255, 0.28);
        border-radius: 8px;
        background: rgba(14, 20, 28, 0.92);
        box-shadow: 0 26px 70px rgba(0, 0, 0, 0.38);
        backdrop-filter: blur(12px);
      }

      .end-confirm-panel strong {
        font-size: 20px;
        line-height: 1;
        font-weight: 1000;
      }

      .end-confirm-panel p {
        margin: 0;
        color: rgba(248, 251, 255, 0.76);
        font-size: 13px;
        line-height: 1.35;
        font-weight: 800;
        text-shadow: none;
      }

      .end-confirm-panel div {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

      .coin-pips i {
        height: 7px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.22);
      }

      .coin-pips i.is-on {
        background: var(--hud-yellow);
        box-shadow: 0 0 10px rgba(255, 212, 71, 0.48);
      }

      .hud-event-stage {
        position: absolute;
        left: 50%;
        top: 24%;
        width: min(420px, calc(100vw - 32px));
        transform: translateX(-50%);
        display: grid;
        gap: 8px;
        justify-items: center;
      }

      .event-card {
        min-width: min(380px, calc(100vw - 48px));
        display: grid;
        grid-template-columns: 70px minmax(0, 1fr);
        gap: 12px;
        align-items: center;
        padding: 10px 12px;
        border: 1px solid rgba(255, 255, 255, 0.34);
        border-radius: 8px;
        background: rgba(13, 18, 26, 0.82);
        box-shadow: 0 18px 50px rgba(0, 0, 0, 0.34);
        backdrop-filter: blur(10px);
        animation: eventPop 880ms ease both;
      }

      .event-icon {
        width: 66px;
        height: 54px;
        display: grid;
        place-items: center;
        border-radius: 8px;
        color: #101820;
        text-shadow: none;
        overflow-wrap: anywhere;
        text-align: center;
        font-size: 14px;
        line-height: 0.95;
        font-weight: 1000;
        box-shadow: inset 0 -7px 0 rgba(0, 0, 0, 0.18);
      }

      .event-copy span {
        display: block;
        color: var(--hud-yellow);
        font-size: 12px;
        font-weight: 1000;
      }

      .event-copy strong {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 24px;
        line-height: 1.05;
        font-weight: 1000;
      }

      .hud-screen-flash {
        position: absolute;
        inset: 0;
        opacity: 0;
        background: radial-gradient(circle at 50% 52%, rgba(255, 255, 255, 0.54), transparent 46%);
        mix-blend-mode: screen;
      }

      .hud-screen-flash.is-active {
        animation: screenFlash 360ms ease-out;
      }

      .hud-wrong-way {
        position: absolute;
        left: 50%;
        top: 132px;
        width: min(330px, calc(100vw - 32px));
        transform: translateX(-50%) translateY(-10px) scale(0.96);
        display: grid;
        gap: 5px;
        justify-items: center;
        padding: 10px 12px 12px;
        border: 1px solid rgba(255, 255, 255, 0.34);
        border-radius: 8px;
        background: rgba(24, 8, 12, 0.82);
        box-shadow: 0 16px 44px rgba(0, 0, 0, 0.34);
        backdrop-filter: blur(10px);
        opacity: 0;
        visibility: hidden;
        overflow: hidden;
        transition: opacity 140ms ease, visibility 140ms ease, transform 140ms ease;
      }

      .hud-wrong-way.is-visible {
        opacity: 1;
        visibility: visible;
        transform: translateX(-50%) translateY(0) scale(1);
      }

      .hud-wrong-way::before {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, rgba(255, 79, 95, 0.48), rgba(255, 202, 58, 0.12));
        opacity: 0.86;
      }

      .hud-wrong-way strong,
      .hud-wrong-way span,
      .hud-wrong-way i {
        position: relative;
        z-index: 1;
      }

      .hud-wrong-way strong {
        color: #ffffff;
        font-size: 22px;
        line-height: 1;
        font-weight: 1000;
      }

      .hud-wrong-way span {
        color: #ffe88f;
        font-size: 11px;
        line-height: 1;
        font-weight: 1000;
        text-shadow: none;
      }

      .hud-wrong-way i {
        width: 100%;
        height: 6px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.2);
        overflow: hidden;
      }

      .hud-wrong-way i::before {
        content: "";
        display: block;
        width: var(--wrong-way-progress, 0%);
        height: 100%;
        border-radius: inherit;
        background: #ffca3a;
        box-shadow: 0 0 12px rgba(255, 202, 58, 0.6);
      }

      .hud-countdown {
        position: absolute;
        left: 50%;
        top: 47%;
        transform: translate(-50%, -50%);
        font-size: clamp(58px, 8vw, 112px);
        font-weight: 1000;
        line-height: 1;
        color: #fff3a3;
        text-shadow: 0 12px 32px rgba(0, 0, 0, 0.42);
      }

      .hud-result {
        position: fixed;
        inset: 0;
        z-index: 2;
        display: grid;
        place-items: center;
        background: rgba(5, 8, 12, 0.48);
        pointer-events: auto;
      }

      .hud-result[hidden] {
        display: none;
      }

      .result-panel {
        width: min(430px, calc(100vw - 36px));
        border-radius: 8px;
        padding: 28px;
        background: rgba(246, 248, 239, 0.96);
        color: #14181e;
        text-shadow: none;
        text-align: center;
        box-shadow: 0 30px 80px rgba(0, 0, 0, 0.32);
      }

      .result-panel h1 {
        margin: 0 0 8px;
        font-size: 32px;
        letter-spacing: 0;
      }

      .result-panel p {
        margin: 0 0 22px;
        color: #38424b;
      }

      .result-ranking {
        display: grid;
        gap: 7px;
        margin: 0 0 20px;
        padding: 0;
        list-style: none;
      }

      .result-ranking li {
        display: grid;
        grid-template-columns: 42px minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
        min-height: 40px;
        padding: 7px 9px;
        border: 1px solid rgba(20, 24, 30, 0.12);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.62);
      }

      .result-ranking b,
      .result-ranking strong,
      .result-ranking span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .result-ranking b {
        font-weight: 1000;
        color: #f0a91f;
      }

      .result-ranking strong {
        text-align: left;
      }

      .result-ranking span {
        color: #53606a;
        font-size: 12px;
        font-weight: 900;
      }

      .result-panel button {
        border: 0;
        border-radius: 8px;
        padding: 12px 18px;
        background: #f0bd2e;
        color: #14181e;
        font-weight: 900;
        cursor: pointer;
      }

      @keyframes itemOrbit {
        to { transform: rotate(360deg); }
      }

      @keyframes itemCoreRoll {
        50% { transform: scale(1.08); filter: hue-rotate(80deg); }
      }

      @keyframes itemReelSpin {
        0% { transform: translateY(18px); }
        100% { transform: translateY(-18px); }
      }

      @keyframes itemSlotPulse {
        to { box-shadow: inset 0 -8px 0 rgba(0, 0, 0, 0.2), 0 0 0 6px rgba(57, 216, 255, 0.28); }
      }

      @keyframes itemReadyPulse {
        0% { transform: scale(0.82); }
        45% { transform: scale(1.12); }
        100% { transform: scale(1); }
      }

      @keyframes eventPop {
        0% { opacity: 0; transform: translateY(18px) scale(0.9); }
        16% { opacity: 1; transform: translateY(0) scale(1.04); }
        75% { opacity: 1; transform: translateY(0) scale(1); }
        100% { opacity: 0; transform: translateY(-12px) scale(0.98); }
      }

      @keyframes screenFlash {
        0% { opacity: 0; }
        28% { opacity: 0.8; }
        100% { opacity: 0; }
      }

      @media (prefers-reduced-motion: reduce) {
        .hud-item-orbit,
        .hud-item-slot.is-rolling .hud-item-reel,
        .hud-item-slot.is-rolling .hud-item-core,
        .event-card,
        .hud-screen-flash.is-active {
          animation-duration: 1ms;
          animation-iteration-count: 1;
        }
      }

      @media (max-width: 760px) {
        .hud-race-card {
          top: 10px;
          left: 10px;
          grid-template-columns: 68px 124px;
          padding: 8px;
        }

        .hud-position {
          min-height: 68px;
        }

        .hud-position strong {
          font-size: 34px;
        }

        .hud-race-meta strong {
          font-size: 12px;
        }

        .hud-item-slot {
          top: auto;
          left: 10px;
          bottom: 64px;
          min-width: 0;
          width: 252px;
          transform: translateY(16px) scale(0.92);
          grid-template-columns: 72px minmax(0, 1fr);
        }

        .hud-item-slot.is-visible {
          transform: translateY(0) scale(1);
        }

        .hud-item-core {
          width: 70px;
          height: 58px;
        }

        .hud-item-core strong {
          max-width: 64px;
          font-size: 12px;
        }

        .hud-item-label strong {
          font-size: 15px;
        }

        .hud-item-label em {
          font-size: 10px;
        }

        .hud-meter-card {
          top: 10px;
          right: 10px;
          width: 112px;
        }

        .hud-race-options {
          top: 128px;
          right: 10px;
        }

        .hud-gear-button {
          width: 42px;
          height: 42px;
          font-size: 22px;
        }

        .hud-race-menu {
          width: min(218px, calc(100vw - 20px));
        }

        .hud-speed strong {
          font-size: 32px;
        }

        .hud-event-stage {
          top: 28%;
        }

        .hud-wrong-way {
          top: 128px;
          width: min(286px, calc(100vw - 24px));
        }

        .hud-wrong-way strong {
          font-size: 18px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  renderRaceControls() {
    const visible = Boolean(this.raceControls.visible);
    if (!visible) {
      this.raceMenuOpen = false;
      this.endRaceConfirmOpen = false;
    }

    this.refs.raceOptions.hidden = !visible;
    this.refs.raceMenu.hidden = !visible || !this.raceMenuOpen;
    this.refs.endConfirm.hidden = !visible || !this.endRaceConfirmOpen;
    this.refs.raceMenuHint.textContent = this.raceControls.hint ?? '';
    this.refs.endRace.textContent = this.raceControls.endLabel ?? 'Retour lobby';
    this.refs.endRace.disabled = !this.raceControls.canEndRace;
    this.refs.endConfirmTitle.textContent = this.raceControls.confirmTitle ?? 'Fin de course';
    this.refs.endConfirmCopy.textContent =
      this.raceControls.confirmCopy ?? 'Terminer la course et revenir au lobby ?';
    this.refs.confirmEndRace.textContent = this.raceControls.endLabel ?? 'Retour lobby';
  }

  updateRaceControls(raceControls = {}) {
    this.raceControls = {
      visible: false,
      canEndRace: false,
      endLabel: 'Retour lobby',
      hint: '',
      confirmTitle: 'Fin de course',
      confirmCopy: 'Terminer la course et revenir au lobby ?',
      ...raceControls,
    };
    this.renderRaceControls();
  }

  toggleRaceMenu() {
    if (!this.raceControls.visible) return;
    this.raceMenuOpen = !this.raceMenuOpen;
    if (!this.raceMenuOpen) this.endRaceConfirmOpen = false;
    this.renderRaceControls();
  }

  closeRaceMenu() {
    this.raceMenuOpen = false;
    this.endRaceConfirmOpen = false;
    this.renderRaceControls();
  }

  openEndRaceConfirm() {
    if (!this.raceControls.visible || !this.raceControls.canEndRace) return;
    this.endRaceConfirmOpen = true;
    this.renderRaceControls();
  }

  closeEndRaceConfirm() {
    this.endRaceConfirmOpen = false;
    this.renderRaceControls();
  }

  processEvents(events = []) {
    if (!events.length) return;
    const now = performance.now();
    for (const event of events) {
      if (HUD_ONLY_EVENT_TYPES.has(event.type)) continue;
      this.eventFeed.unshift({
        ...event,
        createdAt: now,
        expiresAt: now + (event.type === 'itemReady' ? 1700 : event.type === 'itemUse' ? 1250 : 1050),
      });
      this.triggerFlash();
    }
    this.eventFeed = this.eventFeed.slice(0, 3);
  }

  triggerFlash() {
    const now = performance.now();
    if (now - this.lastFlashAt < 80) return;
    this.lastFlashAt = now;
    this.refs.screenFlash.classList.remove('is-active');
    void this.refs.screenFlash.offsetWidth;
    this.refs.screenFlash.classList.add('is-active');
  }

  renderEvents() {
    const now = performance.now();
    this.eventFeed = this.eventFeed.filter((event) => event.expiresAt > now);
    this.refs.eventStage.innerHTML = this.eventFeed
      .map((event) => `
        <div class="event-card">
          <div class="event-icon" style="background:${colorToCss(event.color)}">${event.short ?? '!'}</div>
          <div class="event-copy">
            <span>${event.title ?? 'EVENT'}</span>
            <strong>${event.label ?? ''}</strong>
          </div>
        </div>
      `)
      .join('');
  }

  updateItemSlot(itemState, rolling) {
    const now = performance.now();
    const hasItem = itemState.itemLabel !== 'Empty';
    const visible = rolling || hasItem;
    const reelSymbol = REEL_SYMBOLS[Math.floor(now / 72) % REEL_SYMBOLS.length];
    const label = rolling ? 'BONUS EN COURS' : itemState.itemUses > 1 ? `${itemState.itemLabel} x${itemState.itemUses}` : itemState.itemLabel;
    const short = rolling ? reelSymbol : itemState.itemIcon;
    const color = rolling ? '#ffffff' : itemState.itemColor;
    const itemKind = rolling ? 'rolling' : itemState.itemType ?? 'empty';
    const hasGlyph = !rolling && GLYPH_KINDS.has(itemKind);

    this.refs.item.textContent = label.toUpperCase();
    this.refs.itemIcon.textContent = short;
    this.refs.itemCore.dataset.kind = itemKind;
    this.refs.itemGlyph.dataset.kind = itemKind;
    this.refs.itemCore.style.background = rolling
      ? 'conic-gradient(from 20deg, #39d8ff, #ffd447, #ff4f9a, #39d8ff)'
      : color;
    this.refs.itemState.textContent = rolling ? 'ROULETTE BONUS' : hasItem ? itemState.itemVerb : '';
    this.refs.itemHint.textContent = rolling
      ? 'Ramassage en cours...'
      : hasItem
        ? `${itemState.itemEffect} - E / F / SHIFT : ${itemState.itemHint}`
        : '';
    this.refs.itemSlot.classList.toggle('is-visible', visible);
    this.refs.itemSlot.classList.toggle('is-rolling', rolling);
    this.refs.itemSlot.classList.toggle('is-ready', !rolling && hasItem);
    this.refs.itemCore.classList.toggle('has-glyph', hasGlyph);
  }

  updateCoinPips(count) {
    const active = Math.max(0, Math.min(10, count));
    this.refs.coinPips.innerHTML = Array.from({ length: 10 }, (_, index) => (
      `<i class="${index < active ? 'is-on' : ''}"></i>`
    )).join('');
  }

  updateWrongWay(wrongWay) {
    const active = Boolean(wrongWay?.active);
    const remaining = Math.max(0, Number(wrongWay?.remaining ?? 0));
    const progress = Math.max(0, Math.min(1, Number(wrongWay?.progress ?? 0)));
    this.refs.wrongWay.classList.toggle('is-visible', active);
    this.refs.wrongWayTimer.textContent = `REMISE EN PISTE DANS ${remaining.toFixed(1)}S`;
    this.refs.wrongWayBar.style.setProperty('--wrong-way-progress', `${progress * 100}%`);
  }

  update({ playerKart, raceManager, itemSystem, events = [], totalKarts, wrongWay = null, raceControls = null, finalResults = null }) {
    this.processEvents(events);

    const state = raceManager.getKartState(playerKart.id);
    const lap = state?.lap ?? 1;
    const best = state?.bestLapTime ?? 0;
    const position = raceManager.getPosition(playerKart.id);
    const itemState = itemSystem?.getHUDState(playerKart) ?? {
      itemLabel: 'Empty',
      itemShort: '-',
      itemIcon: '-',
      itemColor: '#6f7b84',
      itemHint: '',
      itemVerb: '',
      itemEffect: '',
      itemUses: 0,
      itemType: 'empty',
    };
    const coinCount = playerKart.coinCount ?? 0;

    this.refs.speed.textContent = `${Math.max(0, Math.round(Math.abs(playerKart.currentSpeed) * 3.6))}`;
    this.refs.speedCard.classList.toggle('is-boosting', playerKart.boostTimer > 0 || playerKart.invincibleTimer > 0);
    this.refs.lap.textContent = `${lap}/${raceManager.totalLaps}`;
    this.refs.position.textContent = `${position}`;
    this.refs.total.textContent = `/${totalKarts}`;
    this.refs.time.textContent = formatRaceTime(raceManager.timer);
    this.refs.best.textContent = best > 0 ? formatRaceTime(best) : '--';
    this.refs.coins.textContent = `${coinCount}`;
    this.updateCoinPips(coinCount);
    this.updateItemSlot(itemState, playerKart.itemRouletteTimer > 0);
    this.updateWrongWay(wrongWay);
    this.updateRaceControls(raceControls);
    this.renderEvents();
    this.refs.countdown.textContent = raceManager.getCountdownText();

    if (Array.isArray(finalResults) && finalResults.length) {
      this.refs.result.hidden = false;
      this.refs.resultTitle.textContent = 'Classement final';
      this.refs.resultSummary.textContent = 'Tous les joueurs connectes ont termine la course.';
      this.refs.resultRanking.innerHTML = finalResults
        .map((entry) => `
          <li>
            <b>#${entry.rank}</b>
            <strong>${entry.name ?? entry.id ?? 'Player'}</strong>
            <span>${entry.finished ? formatRaceTime(entry.finishTime) : 'DNF'}</span>
          </li>
        `)
        .join('');
    } else if (raceManager.state === 'finished' && state?.finished) {
      this.refs.result.hidden = false;
      this.refs.resultTitle.textContent = 'Course terminee';
      this.refs.resultSummary.textContent = `Finished ${position} / ${totalKarts} in ${formatRaceTime(
        state.finishTime,
      )}. En attente des autres joueurs.`;
      this.refs.resultRanking.innerHTML = '';
    } else {
      this.refs.result.hidden = true;
      this.refs.resultRanking.innerHTML = '';
    }
  }
}
