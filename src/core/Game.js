import * as THREE from 'three';
import { SceneManager } from './SceneManager.js';
import { Track } from '../world/Track.js';
import { TrackDecor } from '../world/TrackDecor.js';
import { Kart } from '../karts/Kart.js';
import { PlayerKart } from '../karts/PlayerKart.js';
import { AIKart } from '../karts/AIKart.js';
import { KartPhysics } from '../physics/KartPhysics.js';
import { RaceManager } from '../race/RaceManager.js';
import { ItemSystem } from '../race/ItemSystem.js';
import { InputManager } from '../input/InputManager.js';
import { CameraController } from '../camera/CameraController.js';
import { HUD } from '../ui/HUD.js';
import { LobbyUI } from '../ui/LobbyUI.js';
import { MultiplayerClient } from '../network/MultiplayerClient.js';
import { angleDifference } from '../utils/math.js';

const slipForward = new THREE.Vector3();
const slipRelative = new THREE.Vector3();
const slipLateral = new THREE.Vector3();

const AI_COLORS = [
  [0x2f80ed, 0xf5f5f0],
  [0xeb5757, 0x20242a],
  [0x27ae60, 0xf7e15d],
  [0x9b51e0, 0xf2f2f2],
  [0xf2994a, 0x1a1d20],
  [0x56ccf2, 0x102030],
  [0xbb6bd9, 0xfff2a8],
];

const RACE_SAVE_KEY = 'kartingActiveRaceStateV1';
const RACE_SAVE_VERSION = 1;
const RACE_SAVE_INTERVAL = 0.35;
const RACE_SAVE_MAX_AGE = 1000 * 60 * 60 * 6;
const WRONG_WAY_RESET_SECONDS = 5;
const WRONG_WAY_MIN_SPEED = 5.5;
const WRONG_WAY_TIMER_DECAY = 2.25;

export class Game {
  constructor(container) {
    this.container = container;
    this.sceneManager = new SceneManager(container);
    this.input = new InputManager();
    this.physics = new KartPhysics();
    this.track = new Track(this.sceneManager.scene);
    this.decor = new TrackDecor(this.sceneManager.scene, this.track);
    this.player = new PlayerKart();
    this.aiKarts = AI_COLORS.map(
      ([color, accent], index) => new AIKart(index + 1, color, accent),
    );
    this.karts = [this.player, ...this.aiKarts];
    this.raceManager = new RaceManager(this.track, 2);
    this.itemSystem = new ItemSystem(this.sceneManager.scene, this.track);
    this.cameraController = new CameraController(this.sceneManager.camera, this.track);
    this.hud = new HUD({
      onRestart: () => this.resetRace(),
      onEndRace: () => this.requestEndCurrentRace(),
    });
    this.multiplayer = new MultiplayerClient();
    this.remoteKarts = new Map();
    this.multiplayerMode = 'solo';
    this.networkSendTimer = 0;
    this.raceGrid = [];
    this.lobbyUI = new LobbyUI({
      onCreate: (name) => this.multiplayer.createLobby(name),
      onJoin: (code, name) => this.multiplayer.joinLobby(code, name),
      onReady: (ready) => this.multiplayer.setReady(ready),
      onStart: () => this.multiplayer.requestStart(),
      onEnd: () => this.multiplayer.endLobby(),
      onSolo: () => this.startSoloMode(),
    });
    this.lastTime = 0;
    this.running = false;
    this.startGridLocks = [];
    this.raceSaveTimer = 0;
    this.restoredPlayerPose = null;
    this.restoredPlayerHoldTimer = 0;
    this.wrongWayTimer = 0;
    this.wrongWayHud = {
      active: false,
      remaining: WRONG_WAY_RESET_SECONDS,
      progress: 0,
    };

    for (const kart of this.karts) {
      this.sceneManager.scene.add(kart.mesh);
    }

    this.bindMultiplayer();
    this.resetRace({ clearSavedRace: false });
    if (this.restoreSavedRace()) {
      this.lobbyUI.showRaceBadge();
    } else {
      this.raceManager.state = 'menu';
      this.raceManager.countdownRemaining = 0;
    }
    window.addEventListener('beforeunload', () => this.saveRaceState(true));
    if (this.raceManager.state === 'menu' && this.multiplayer.restoreSession()) {
      this.lobbyUI.setStatus('Reconnexion lobby...');
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame((time) => this.loop(time));
  }

  loop(time) {
    if (!this.running) return;
    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;
    this.update(dt);
    this.sceneManager.render();
    requestAnimationFrame((next) => this.loop(next));
  }

  update(dt) {
    if (this.input.consumeCameraToggle()) {
      this.cameraController.toggleTopDown();
    }
    if (this.input.consumeDebugCameraToggle()) {
      this.cameraController.toggleDebugOrbit();
    }
    if (this.input.consumeReset()) {
      this.resetKartToTrack(this.player);
    }

    const playerInput = this.input.getControls();
    const playerWantsItem = typeof this.input.consumeItemUse === 'function'
      ? this.input.consumeItemUse()
      : Boolean(this.input.itemUseRequested);
    if (typeof this.input.consumeItemUse !== 'function') {
      this.input.itemUseRequested = false;
    }
    const wasCountdown = this.raceManager.state === 'countdown';
    const countdownBefore = this.raceManager.countdownRemaining;

    this.raceManager.tickPhase(dt);
    const raceRunning = this.raceManager.isRunning();
    if (wasCountdown && raceRunning) {
      this.applyRocketStart(playerInput, countdownBefore);
    }

    const activeKarts = this.getActiveKarts();
    const itemKarts = this.multiplayerMode === 'multiplayer' ? [this.player] : activeKarts;
    this.itemSystem.update(dt, itemKarts, this.raceManager, raceRunning && playerWantsItem);

    if (!raceRunning && ['menu', 'lobby', 'countdown'].includes(this.raceManager.state)) {
      this.updateWrongWay(dt, false);
      this.lockStartingGrid();
      this.raceManager.updateRace(this.getActiveKarts(), this.player);
      this.cameraController.update(dt, this.player);
      this.hud.update({
        playerKart: this.player,
        raceManager: this.raceManager,
        itemSystem: this.itemSystem,
        events: this.itemSystem.consumeEventsFor(this.player.id),
        totalKarts: this.getActiveKarts().length,
        wrongWay: this.wrongWayHud,
        raceControls: this.getRaceControls(),
      });
      this.sendLocalKartState(dt);
      this.persistRaceState(dt);
      return;
    }

    this.applySlipstream(dt, raceRunning);

    const playerControls = raceRunning
      ? playerInput
      : { throttle: 0, brake: 0, steer: 0, handbrake: false };
    this.physics.updateKart(this.player, playerControls, this.track, dt);

    if (this.multiplayerMode === 'solo') {
      for (const ai of this.aiKarts) {
        const controls = ai.computeControls(dt, this.track, raceRunning);
        this.physics.updateKart(ai, controls, this.track, dt);
      }
    } else {
      this.syncRemoteKarts(dt);
    }

    const raceKarts = this.getActiveKarts();
    this.physics.resolveKartCollisions(raceKarts);
    for (const kart of raceKarts) {
      const impact = this.physics.resolveTrackCollision(kart, this.track);
      if (impact > 0) {
        kart.collisionImpulse = Math.max(kart.collisionImpulse, impact);
      }
      kart.syncMesh(dt);
    }
    this.holdRestoredPlayerPosition(dt);
    this.updateWrongWay(dt, raceRunning);

    this.raceManager.updateRace(raceKarts, this.player);
    this.cameraController.update(dt, this.player);
    this.hud.update({
      playerKart: this.player,
      raceManager: this.raceManager,
      itemSystem: this.itemSystem,
      events: this.itemSystem.consumeEventsFor(this.player.id),
      totalKarts: raceKarts.length,
      wrongWay: this.wrongWayHud,
      raceControls: this.getRaceControls(),
    });
    this.sendLocalKartState(dt);
    this.persistRaceState(dt);
  }

  resetRace({ clearSavedRace = true } = {}) {
    if (clearSavedRace) this.clearSavedRaceState();
    this.startGridLocks.length = 0;
    const raceKarts = this.getActiveKarts();
    for (let i = 0; i < raceKarts.length; i += 1) {
      const pose = this.track.getStartGridPose(i);
      raceKarts[i].resetToPose(pose.position, pose.yaw);
      this.startGridLocks.push({
        position: pose.position.clone(),
        yaw: pose.yaw,
      });
    }
    this.raceManager.reset(raceKarts);
    this.itemSystem.reset(raceKarts);
    this.cameraController.mode = 'chase';
    this.clearWrongWayWarning();
  }

  isRaceSaveable() {
    return (
      this.multiplayerMode === 'solo' &&
      (this.raceManager.state === 'countdown' || this.raceManager.state === 'running')
    );
  }

  persistRaceState(dt) {
    if (!this.isRaceSaveable()) {
      if (['menu', 'lobby', 'finished'].includes(this.raceManager.state) || this.multiplayerMode !== 'solo') {
        this.clearSavedRaceState();
      }
      return;
    }

    this.raceSaveTimer -= dt;
    if (this.raceSaveTimer > 0) return;
    this.raceSaveTimer = RACE_SAVE_INTERVAL;
    this.saveRaceState();
  }

  saveRaceState(force = false) {
    if (!this.isRaceSaveable()) return;
    if (!force && this.raceSaveTimer > RACE_SAVE_INTERVAL) return;

    const activeKarts = this.getActiveKarts();
    const snapshot = {
      version: RACE_SAVE_VERSION,
      timestamp: Date.now(),
      mode: this.multiplayerMode,
      playerId: this.player.id,
      cameraMode: this.cameraController.mode,
      race: this.raceManager.snapshot(),
      karts: activeKarts.map((kart) => this.snapshotKart(kart)),
    };

    try {
      window.localStorage.setItem(RACE_SAVE_KEY, JSON.stringify(snapshot));
    } catch {
      // Storage can fail in private browsing or quota-limited environments.
    }
  }

  clearSavedRaceState() {
    try {
      window.localStorage.removeItem(RACE_SAVE_KEY);
    } catch {
      // Ignore storage failures; gameplay should continue.
    }
  }

  restoreSavedRace() {
    let snapshot = null;
    try {
      const raw = window.localStorage.getItem(RACE_SAVE_KEY);
      if (!raw) return false;
      snapshot = JSON.parse(raw);
    } catch {
      this.clearSavedRaceState();
      return false;
    }

    const freshEnough = Date.now() - Number(snapshot.timestamp ?? 0) <= RACE_SAVE_MAX_AGE;
    if (
      snapshot?.version !== RACE_SAVE_VERSION ||
      snapshot.mode !== 'solo' ||
      !freshEnough ||
      !Array.isArray(snapshot.karts)
    ) {
      this.clearSavedRaceState();
      return false;
    }

    this.multiplayerMode = 'solo';
    this.player.id = 'player';
    this.clearRemoteKarts();
    this.setAIMeshesVisible(true);
    this.raceGrid = [];

    const activeKarts = this.getActiveKarts();
    for (const kartSnapshot of snapshot.karts) {
      const kart = activeKarts.find((candidate) => candidate.id === kartSnapshot.id);
      if (kart) this.restoreKart(kart, kartSnapshot);
    }
    this.player.velocity.set(0, 0, 0);
    this.player.currentSpeed = 0;
    this.player.steeringAngle = 0;

    if (!this.raceManager.restore(snapshot.race, activeKarts)) {
      this.clearSavedRaceState();
      return false;
    }

    this.startGridLocks.length = 0;
    for (const kart of activeKarts) {
      this.startGridLocks.push({
        position: kart.position.clone(),
        yaw: kart.yaw,
      });
      kart.syncMesh(0);
    }

    this.cameraController.mode = snapshot.cameraMode === 'top' ? 'top' : 'chase';
    this.restoredPlayerPose = {
      position: this.player.position.clone(),
      yaw: this.player.yaw,
    };
    this.restoredPlayerHoldTimer = 0.75;
    this.cameraController.update(1 / 60, this.player);
    this.raceManager.updatePositions(activeKarts);
    this.hud.update({
      playerKart: this.player,
      raceManager: this.raceManager,
      itemSystem: this.itemSystem,
      events: [],
      totalKarts: activeKarts.length,
      wrongWay: this.wrongWayHud,
      raceControls: this.getRaceControls(),
    });
    this.saveRaceState(true);
    return true;
  }

  snapshotKart(kart) {
    return {
      id: kart.id,
      position: [kart.position.x, kart.position.y, kart.position.z],
      velocity: [kart.velocity.x, kart.velocity.y, kart.velocity.z],
      yaw: kart.yaw,
      steeringAngle: kart.steeringAngle,
      currentSpeed: kart.currentSpeed,
      collisionImpulse: kart.collisionImpulse,
      distanceDriven: kart.distanceDriven,
      driftCharge: kart.driftCharge,
      driftDirection: kart.driftDirection,
      wasDrifting: kart.wasDrifting,
      boostTimer: kart.boostTimer,
      coinCount: kart.coinCount,
      heldItem: this.snapshotItem(kart.heldItem),
      pendingItem: this.snapshotItem(kart.pendingItem),
      itemRouletteTimer: kart.itemRouletteTimer,
      itemUseCooldown: kart.itemUseCooldown,
      aiItemDelay: kart.aiItemDelay,
      invincibleTimer: kart.invincibleTimer,
      stunTimer: kart.stunTimer,
      slowTimer: kart.slowTimer,
      visualScale: kart.visualScale,
      slipstreamCharge: kart.slipstreamCharge,
      jumpTimer: kart.jumpTimer,
      jumpDuration: kart.jumpDuration,
    };
  }

  restoreKart(kart, snapshot) {
    const position = Array.isArray(snapshot.position) ? snapshot.position : [0, 0.18, 0];
    const velocity = Array.isArray(snapshot.velocity) ? snapshot.velocity : [0, 0, 0];
    kart.position.set(
      Number(position[0] ?? 0),
      Number(position[1] ?? 0.18),
      Number(position[2] ?? 0),
    );
    kart.velocity.set(
      Number(velocity[0] ?? 0),
      Number(velocity[1] ?? 0),
      Number(velocity[2] ?? 0),
    );
    kart.yaw = Number(snapshot.yaw ?? kart.yaw);
    kart.steeringAngle = Number(snapshot.steeringAngle ?? 0);
    kart.currentSpeed = Number(snapshot.currentSpeed ?? 0);
    kart.collisionImpulse = Number(snapshot.collisionImpulse ?? 0);
    kart.distanceDriven = Number(snapshot.distanceDriven ?? 0);
    kart.driftCharge = Number(snapshot.driftCharge ?? 0);
    kart.driftDirection = Number(snapshot.driftDirection ?? 0);
    kart.wasDrifting = Boolean(snapshot.wasDrifting);
    kart.boostTimer = Number(snapshot.boostTimer ?? 0);
    kart.coinCount = Number(snapshot.coinCount ?? 0);
    kart.heldItem = this.restoreItem(snapshot.heldItem);
    kart.pendingItem = this.restoreItem(snapshot.pendingItem);
    kart.itemRouletteTimer = Number(snapshot.itemRouletteTimer ?? 0);
    kart.itemUseCooldown = Number(snapshot.itemUseCooldown ?? 0);
    kart.aiItemDelay = Number(snapshot.aiItemDelay ?? 0);
    kart.invincibleTimer = Number(snapshot.invincibleTimer ?? 0);
    kart.stunTimer = Number(snapshot.stunTimer ?? 0);
    kart.slowTimer = Number(snapshot.slowTimer ?? 0);
    kart.visualScale = Number(snapshot.visualScale ?? 1);
    kart.slipstreamCharge = Number(snapshot.slipstreamCharge ?? 0);
    kart.jumpTimer = Number(snapshot.jumpTimer ?? 0);
    kart.jumpDuration = Number(snapshot.jumpDuration ?? 0);
  }

  snapshotItem(item) {
    if (!item?.type) return null;
    return {
      type: item.type,
      uses: Number(item.uses ?? 1),
    };
  }

  restoreItem(snapshot) {
    if (!snapshot?.type) return null;
    return this.itemSystem.createItem(snapshot.type, snapshot.uses);
  }

  holdRestoredPlayerPosition(dt) {
    if (!this.restoredPlayerPose || this.restoredPlayerHoldTimer <= 0) return;
    this.restoredPlayerHoldTimer = Math.max(0, this.restoredPlayerHoldTimer - dt);
    this.player.position.copy(this.restoredPlayerPose.position);
    this.player.yaw = this.restoredPlayerPose.yaw;
    this.player.velocity.set(0, 0, 0);
    this.player.currentSpeed = 0;
    this.player.steeringAngle = 0;
    this.player.syncMesh(0);
    if (this.restoredPlayerHoldTimer <= 0) {
      this.restoredPlayerPose = null;
    }
  }

  lockStartingGrid() {
    const raceKarts = this.getActiveKarts();
    for (let i = 0; i < raceKarts.length; i += 1) {
      const lock = this.startGridLocks[i];
      if (!lock) continue;
      const kart = raceKarts[i];
      kart.position.copy(lock.position);
      kart.velocity.set(0, 0, 0);
      kart.yaw = lock.yaw;
      kart.steeringAngle = 0;
      kart.currentSpeed = 0;
      kart.collisionImpulse = 0;
      kart.driftCharge = 0;
      kart.driftDirection = 0;
      kart.wasDrifting = false;
      kart.boostTimer = 0;
      kart.stunTimer = 0;
      kart.slowTimer = 0;
      kart.slipstreamCharge = 0;
      kart.syncMesh(0);
    }
  }

  resetKartToTrack(kart) {
    const pose = this.track.getResetPose(kart.position);
    kart.resetToPose(pose.position, pose.yaw);
    if (kart === this.player) this.clearWrongWayWarning();
  }

  clearWrongWayWarning() {
    this.wrongWayTimer = 0;
    this.wrongWayHud = {
      active: false,
      remaining: WRONG_WAY_RESET_SECONDS,
      progress: 0,
    };
  }

  updateWrongWay(dt, raceRunning) {
    if (!raceRunning || this.raceManager.state === 'finished') {
      this.clearWrongWayWarning();
      return;
    }

    const surface = this.track.getSurfaceInfo(this.player.position);
    const speedSq =
      this.player.velocity.x * this.player.velocity.x +
      this.player.velocity.z * this.player.velocity.z;
    const speed = Math.sqrt(speedSq);
    const tangentSpeed = this.player.velocity.dot(surface.tangent);
    const drivingWrongWay =
      surface.onTrack &&
      speed > WRONG_WAY_MIN_SPEED &&
      tangentSpeed < -WRONG_WAY_MIN_SPEED &&
      this.player.stunTimer <= 0.05;

    if (drivingWrongWay) {
      this.wrongWayTimer += dt;
    } else {
      this.wrongWayTimer = Math.max(0, this.wrongWayTimer - dt * WRONG_WAY_TIMER_DECAY);
    }

    if (this.wrongWayTimer >= WRONG_WAY_RESET_SECONDS) {
      this.repositionKartForward(this.player);
      this.clearWrongWayWarning();
      return;
    }

    this.wrongWayHud = {
      active: this.wrongWayTimer > 0.2,
      remaining: Math.max(0, WRONG_WAY_RESET_SECONDS - this.wrongWayTimer),
      progress: Math.min(1, this.wrongWayTimer / WRONG_WAY_RESET_SECONDS),
    };
  }

  repositionKartForward(kart) {
    const pose = this.track.getResetPose(kart.position);
    kart.position.copy(pose.position);
    kart.position.y = 0.18;
    kart.velocity.set(0, 0, 0);
    kart.yaw = pose.yaw;
    kart.steeringAngle = 0;
    kart.currentSpeed = 0;
    kart.driftCharge = 0;
    kart.driftDirection = 0;
    kart.wasDrifting = false;
    kart.boostTimer = 0;
    kart.jumpTimer = 0;
    kart.jumpDuration = 0;
    kart.collisionImpulse = Math.max(kart.collisionImpulse, 0.65);
    kart.syncMesh(0);
  }

  applyRocketStart(playerInput, countdownBefore) {
    if (playerInput.throttle > 0 && countdownBefore <= 1.05) {
      this.player.boostTimer = Math.max(this.player.boostTimer, 1.25);
      this.player.collisionImpulse = Math.max(this.player.collisionImpulse, 0.65);
    } else if (playerInput.throttle > 0) {
      this.player.stunTimer = Math.max(this.player.stunTimer, 0.28);
    }

    if (this.multiplayerMode === 'multiplayer') return;
    for (const ai of this.aiKarts) {
      const roll = Math.sin(ai.aiIndex * 8.13 + performance.now() * 0.001);
      if (roll > -0.15) {
        ai.boostTimer = Math.max(ai.boostTimer, roll > 0.65 ? 1.18 : 0.58);
      }
    }
  }

  applySlipstream(dt, raceRunning) {
    const raceKarts = this.getActiveKarts();
    if (!raceRunning) {
      for (const kart of raceKarts) kart.slipstreamCharge = 0;
      return;
    }

    for (const kart of raceKarts) {
      if (kart.stunTimer > 0 || kart.currentSpeed < 12) {
        kart.slipstreamCharge = Math.max(0, kart.slipstreamCharge - dt * 1.4);
        continue;
      }

      kart.getForwardVector(slipForward);
      let inDraft = false;
      for (const other of raceKarts) {
        if (other.id === kart.id) continue;
        slipRelative.copy(other.position).sub(kart.position).setY(0);
        const forwardDistance = slipRelative.dot(slipForward);
        if (forwardDistance < 5 || forwardDistance > 24) continue;
        slipLateral.copy(slipRelative).addScaledVector(slipForward, -forwardDistance);
        if (slipLateral.lengthSq() > 15.2) continue;
        inDraft = true;
        break;
      }

      if (inDraft) {
        kart.slipstreamCharge += dt;
        if (kart.slipstreamCharge > 1.18) {
          kart.boostTimer = Math.max(kart.boostTimer, 0.72);
          kart.collisionImpulse = Math.max(kart.collisionImpulse, 0.34);
          kart.slipstreamCharge = 0;
        }
      } else {
        kart.slipstreamCharge = Math.max(0, kart.slipstreamCharge - dt * 0.9);
      }
    }
  }

  bindMultiplayer() {
    this.multiplayer.addEventListener('status', (event) => {
      this.lobbyUI.setStatus(event.detail.label);
      if (event.detail.label === 'Connecte') this.lobbyUI.setError('');
    });
    this.multiplayer.addEventListener('error', (event) => {
      this.lobbyUI.setError(event.detail.message);
    });
    this.multiplayer.addEventListener('joined', (event) => {
      this.lobbyUI.setError('');
      this.multiplayerMode = 'multiplayer';
      this.player.id = event.detail.playerId;
      this.setAIMeshesVisible(false);
      this.applyLocalPlayerLivery(event.detail.lobby.players ?? []);
      this.lobbyUI.updateLobby(event.detail.lobby, this.player.id);
      if (this.isNetworkRaceActive(event.detail.lobby)) {
        this.resumeMultiplayerRace(event.detail.lobby);
      } else {
        this.enterMultiplayerLobby(event.detail.lobby);
      }
    });
    this.multiplayer.addEventListener('lobby', (event) => {
      this.lobbyUI.setError('');
      this.applyLocalPlayerLivery(event.detail.lobby.players ?? []);
      this.lobbyUI.updateLobby(event.detail.lobby, this.player.id);
      this.syncRemotePlayers(event.detail.lobby.players ?? []);
      if (this.isNetworkRaceActive(event.detail.lobby)) {
        if (this.multiplayerMode !== 'multiplayer' || !['countdown', 'running'].includes(this.raceManager.state)) {
          this.resumeMultiplayerRace(event.detail.lobby);
        } else {
          this.applyLobbyLastStates(event.detail.lobby.players ?? []);
        }
      } else if (event.detail.lobby.state === 'lobby') {
        this.enterMultiplayerLobby(event.detail.lobby);
      }
    });
    this.multiplayer.addEventListener('raceStart', (event) => {
      this.startMultiplayerRace(event.detail.grid, event.detail.startAt);
    });
    this.multiplayer.addEventListener('kartState', (event) => {
      this.applyRemoteKartState(event.detail.state);
    });
    this.multiplayer.addEventListener('playerLeft', (event) => {
      this.removeRemoteKart(event.detail.playerId);
    });
    this.multiplayer.addEventListener('lobbyEnded', () => {
      this.handleLobbyEnded();
    });
    this.multiplayer.addEventListener('raceEnded', (event) => {
      this.handleRaceEnded(event.detail.lobby);
    });
  }

  startSoloMode() {
    this.multiplayerMode = 'solo';
    this.player.id = 'player';
    this.clearRemoteKarts();
    this.setAIMeshesVisible(true);
    this.raceGrid = [];
    this.resetRace();
  }

  requestEndCurrentRace() {
    if (this.multiplayerMode === 'multiplayer') {
      if (!this.isLocalLobbyHost()) {
        this.lobbyUI.setError('Seul le host peut terminer la course.');
        return;
      }
      this.multiplayer.endRace();
      return;
    }

    this.endSoloRaceToMenu();
  }

  endSoloRaceToMenu() {
    this.clearSavedRaceState();
    this.resetRace();
    this.raceManager.state = 'menu';
    this.raceManager.countdownRemaining = 0;
    this.raceManager.goFlash = 0;
    this.lobbyUI.resetToMenu('Course arretee.');
  }

  getRaceControls() {
    const raceVisible = ['countdown', 'running', 'finished'].includes(this.raceManager.state);
    if (!raceVisible) return { visible: false };

    if (this.multiplayerMode === 'multiplayer') {
      const isHost = this.isLocalLobbyHost();
      return {
        visible: true,
        canEndRace: isHost,
        endLabel: 'Retour lobby',
        hint: isHost
          ? 'Termine la course pour tous les joueurs et garde le lobby ouvert.'
          : 'Seul le host peut terminer la course.',
        confirmTitle: 'Retour lobby',
        confirmCopy: 'Terminer la course pour tous les joueurs et revenir au lobby ?',
      };
    }

    return {
      visible: true,
      canEndRace: true,
      endLabel: 'Retour menu',
      hint: 'Quitte la course solo en cours.',
      confirmTitle: 'Quitter la course',
      confirmCopy: 'Arreter la course solo et revenir au menu ?',
    };
  }

  isLocalLobbyHost() {
    const players = this.multiplayer.lobby?.players ?? [];
    return players.some((player) => player.id === this.player.id && player.host);
  }

  handleLobbyEnded() {
    this.multiplayerMode = 'solo';
    this.player.id = 'player';
    this.clearRemoteKarts();
    this.setAIMeshesVisible(true);
    this.raceGrid = [];
    this.resetRace();
    this.raceManager.state = 'menu';
    this.raceManager.countdownRemaining = 0;
    this.lobbyUI.resetToMenu('Lobby ferme par le host.');
  }

  handleRaceEnded(lobby) {
    if (!lobby) return;
    this.multiplayerMode = 'multiplayer';
    this.clearSavedRaceState();
    this.enterMultiplayerLobby(lobby);
    this.lobbyUI.setError('Course terminee. Retour lobby.');
  }

  enterMultiplayerLobby(lobby) {
    this.applyLocalPlayerLivery(lobby.players ?? []);
    this.syncRemotePlayers(lobby.players ?? []);
    this.positionLobbyKarts(lobby.players ?? []);
    const lobbyKarts = this.getActiveKarts();
    this.raceManager.reset(lobbyKarts);
    this.raceManager.state = 'lobby';
    this.raceManager.countdownRemaining = 0;
    this.raceManager.goFlash = 0;
    this.itemSystem.reset(lobbyKarts);
    this.clearWrongWayWarning();
    this.lobbyUI.showLobbyPanel();
    this.raceManager.updateRace(lobbyKarts, this.player);
  }

  isNetworkRaceActive(lobby) {
    return lobby?.state === 'countdown' || lobby?.state === 'running';
  }

  resumeMultiplayerRace(lobby) {
    const players = lobby.players ?? [];
    this.clearSavedRaceState();
    this.multiplayerMode = 'multiplayer';
    this.setAIMeshesVisible(false);
    this.raceGrid = players;
    this.applyLocalPlayerLivery(players);
    this.syncRemotePlayers(players);

    const orderedKarts = players
      .map((entry) => this.getKartByNetworkId(entry.id))
      .filter(Boolean);
    if (!orderedKarts.includes(this.player)) orderedKarts.unshift(this.player);

    this.startGridLocks.length = 0;
    for (let i = 0; i < orderedKarts.length; i += 1) {
      const kart = orderedKarts[i];
      const entry = players.find((candidate) => candidate.id === kart.id);
      if (entry?.lastState) {
        this.applySavedNetworkState(kart, entry.lastState, {
          immediate: true,
          zeroSpeed: kart === this.player,
        });
      } else {
        const pose = this.track.getStartGridPose(entry?.gridIndex ?? i);
        kart.resetToPose(pose.position, pose.yaw);
      }
      this.startGridLocks.push({
        position: kart.position.clone(),
        yaw: kart.yaw,
      });
    }

    this.raceManager.reset(orderedKarts);
    this.raceManager.state = lobby.state === 'running' ? 'running' : 'countdown';
    this.raceManager.countdownRemaining = lobby.state === 'countdown' ? 0.35 : 0;
    this.raceManager.goFlash = 0;
    this.itemSystem.reset(orderedKarts);
    this.lobbyUI.showRaceBadge();
  }

  applyLobbyLastStates(players) {
    for (const player of players) {
      if (!player?.lastState || player.id === this.player.id) continue;
      const entry = this.remoteKarts.get(player.id);
      if (entry) {
        this.applySavedNetworkState(entry.kart, player.lastState);
      }
    }
  }

  applySavedNetworkState(kart, state, options = {}) {
    if (!state) return;
    const x = Number(state.x ?? kart.position.x);
    const y = Number(state.y ?? kart.position.y);
    const z = Number(state.z ?? kart.position.z);
    const yaw = Number(state.yaw ?? kart.yaw);
    const speed = options.zeroSpeed ? 0 : Number(state.speed ?? 0);

    if (options.immediate || kart === this.player) {
      kart.position.set(x, y, z);
      kart.yaw = yaw;
      kart.velocity.set(0, 0, 0);
      kart.syncMesh(0);
    }
    if (kart.networkTarget) {
      kart.networkTarget.position.set(x, y, z);
      kart.networkTarget.yaw = yaw;
    }
    kart.currentSpeed = speed;
    kart.steeringAngle = Number(state.steering ?? 0);
    kart.boostTimer = Math.max(kart.boostTimer, Number(state.boost ?? 0) > 0 ? 0.12 : 0);
    kart.driftCharge = Number(state.drift ?? 0);
    kart.coinCount = Number(state.coins ?? 0);
  }

  startMultiplayerRace(grid, startAt) {
    this.multiplayerMode = 'multiplayer';
    this.setAIMeshesVisible(false);
    this.raceGrid = grid ?? [];
    this.applyLocalPlayerLivery(this.raceGrid);
    this.syncRemotePlayers(this.raceGrid);

    const orderedKarts = this.raceGrid
      .map((entry) => this.getKartByNetworkId(entry.id))
      .filter(Boolean);
    if (!orderedKarts.includes(this.player)) orderedKarts.unshift(this.player);

    this.startGridLocks.length = 0;
    for (let i = 0; i < orderedKarts.length; i += 1) {
      const entry = this.raceGrid.find((candidate) => candidate.id === orderedKarts[i].id);
      const pose = this.track.getStartGridPose(entry?.gridIndex ?? i);
      orderedKarts[i].resetToPose(pose.position, pose.yaw);
      this.startGridLocks.push({
        position: pose.position.clone(),
        yaw: pose.yaw,
      });
    }

    this.raceManager.reset(orderedKarts);
    this.raceManager.countdownRemaining = Math.max(0.25, ((startAt ?? Date.now() + 3000) - Date.now()) / 1000);
    this.itemSystem.reset(orderedKarts);
    this.lobbyUI.showRaceBadge();
  }

  getActiveKarts() {
    if (this.multiplayerMode === 'multiplayer') {
      const lobbyPlayers = this.multiplayer.lobby?.players ?? this.raceGrid;
      const ordered = lobbyPlayers
        .map((player) => this.getKartByNetworkId(player.id))
        .filter(Boolean);
      return ordered.length ? ordered : [this.player, ...this.remoteKarts.values()];
    }
    return [this.player, ...this.aiKarts];
  }

  getKartByNetworkId(id) {
    if (id === this.player.id) return this.player;
    return this.remoteKarts.get(id)?.kart ?? null;
  }

  applyLocalPlayerLivery(players) {
    const local = players.find((candidate) => candidate.id === this.player.id);
    if (!local) return;
    this.player.setLivery(Number(local.color ?? this.player.color), Number(local.accent ?? this.player.accent));
  }

  syncRemotePlayers(players) {
    const wanted = new Set();
    for (const player of players) {
      if (!player?.id || player.id === this.player.id) continue;
      wanted.add(player.id);
      if (this.remoteKarts.has(player.id)) {
        const existing = this.remoteKarts.get(player.id).kart;
        existing.setLivery(Number(player.color ?? existing.color), Number(player.accent ?? existing.accent));
        continue;
      }
      const kart = new Kart(player.id, {
        name: player.name,
        color: Number(player.color ?? 0x2f80ed),
        accent: Number(player.accent ?? 0xf7f7ef),
        aiIndex: (player.gridIndex ?? this.remoteKarts.size) + 1,
        maxSpeed: 43,
        accelerationForce: 52,
        brakeForce: 78,
        reverseForce: 22,
        grip: 14.2,
        boostPower: 24,
      });
      kart.networkTarget = {
        position: kart.position.clone(),
        yaw: kart.yaw,
      };
      this.sceneManager.scene.add(kart.mesh);
      this.remoteKarts.set(player.id, { kart, lastSeen: performance.now() });
    }

    for (const id of this.remoteKarts.keys()) {
      if (!wanted.has(id)) this.removeRemoteKart(id);
    }
  }

  positionLobbyKarts(players) {
    this.startGridLocks.length = 0;
    for (const player of players) {
      const kart = this.getKartByNetworkId(player.id);
      if (!kart) continue;
      const pose = this.track.getStartGridPose(player.gridIndex ?? 0);
      kart.resetToPose(pose.position, pose.yaw);
      this.startGridLocks.push({
        position: pose.position.clone(),
        yaw: pose.yaw,
      });
      if (kart.networkTarget) {
        kart.networkTarget.position.copy(pose.position);
        kart.networkTarget.yaw = pose.yaw;
      }
    }
  }

  applyRemoteKartState(state) {
    if (!state || state.id === this.player.id) return;
    const entry = this.remoteKarts.get(state.id);
    if (!entry) return;
    entry.lastSeen = performance.now();
    entry.kart.networkTarget.position.set(state.x, state.y ?? 0.18, state.z);
    entry.kart.networkTarget.yaw = state.yaw;
    entry.kart.currentSpeed = state.speed;
    entry.kart.steeringAngle = state.steering;
    entry.kart.boostTimer = Math.max(entry.kart.boostTimer, state.boost > 0 ? 0.12 : 0);
    entry.kart.driftCharge = state.drift;
    entry.kart.coinCount = state.coins;
  }

  syncRemoteKarts(dt) {
    for (const { kart } of this.remoteKarts.values()) {
      if (!kart.networkTarget) continue;
      kart.position.lerp(kart.networkTarget.position, Math.min(1, dt * 12));
      kart.yaw += angleDifference(kart.networkTarget.yaw, kart.yaw) * Math.min(1, dt * 12);
      kart.velocity.set(0, 0, 0);
    }
  }

  removeRemoteKart(playerId) {
    const entry = this.remoteKarts.get(playerId);
    if (!entry) return;
    this.sceneManager.scene.remove(entry.kart.mesh);
    this.remoteKarts.delete(playerId);
  }

  clearRemoteKarts() {
    for (const id of [...this.remoteKarts.keys()]) this.removeRemoteKart(id);
  }

  setAIMeshesVisible(visible) {
    for (const ai of this.aiKarts) {
      ai.mesh.visible = visible;
    }
  }

  sendLocalKartState(dt) {
    if (this.multiplayerMode !== 'multiplayer' || !this.multiplayer.lobby) return;
    this.networkSendTimer -= dt;
    if (this.networkSendTimer > 0) return;
    this.networkSendTimer = 0.05;
    this.multiplayer.sendKartState({
      x: this.player.position.x,
      y: this.player.position.y,
      z: this.player.position.z,
      yaw: this.player.yaw,
      speed: this.player.currentSpeed,
      steering: this.player.steeringAngle,
      boost: this.player.boostTimer,
      drift: this.player.driftCharge,
      coins: this.player.coinCount,
    });
  }
}
