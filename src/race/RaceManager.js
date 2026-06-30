import { CheckpointSystem } from './CheckpointSystem.js';

export class RaceManager {
  constructor(track, totalLaps = 3) {
    this.track = track;
    this.totalLaps = totalLaps;
    this.checkpoints = new CheckpointSystem(track, totalLaps);
    this.state = 'countdown';
    this.countdownRemaining = 3;
    this.goFlash = 0;
    this.timer = 0;
    this.positions = [];
    this.playerFinished = false;
  }

  reset(karts) {
    this.state = 'countdown';
    this.countdownRemaining = 3;
    this.goFlash = 0;
    this.timer = 0;
    this.playerFinished = false;
    this.checkpoints.reset(karts);
    this.positions = [...karts];
  }

  snapshot() {
    return {
      totalLaps: this.totalLaps,
      state: this.state,
      countdownRemaining: this.countdownRemaining,
      goFlash: this.goFlash,
      timer: this.timer,
      playerFinished: this.playerFinished,
      checkpoints: this.checkpoints.snapshot(),
    };
  }

  restore(snapshot, karts) {
    if (!snapshot || Number(snapshot.totalLaps) !== this.totalLaps) return false;
    const allowedStates = new Set(['countdown', 'running']);
    if (!allowedStates.has(snapshot.state)) return false;

    this.state = snapshot.state;
    this.countdownRemaining = Number(snapshot.countdownRemaining ?? 0);
    this.goFlash = Number(snapshot.goFlash ?? 0);
    this.timer = Number(snapshot.timer ?? 0);
    this.playerFinished = Boolean(snapshot.playerFinished);
    this.checkpoints.restore(snapshot.checkpoints, karts);
    this.updatePositions(karts);
    return true;
  }

  tickPhase(dt) {
    if (this.state === 'countdown') {
      this.countdownRemaining -= dt;
      if (this.countdownRemaining <= 0) {
        this.state = 'running';
        this.goFlash = 0.9;
        this.timer = 0;
      }
    } else if (this.state === 'running') {
      this.timer += dt;
      this.goFlash = Math.max(0, this.goFlash - dt);
    }
  }

  updateRace(karts, playerKart) {
    if (this.state !== 'running') {
      this.updatePositions(karts);
      return;
    }

    for (const kart of karts) {
      this.checkpoints.updateKart(kart, this.timer);
    }
    this.updatePositions(karts);

    const playerState = this.checkpoints.getState(playerKart.id);
    if (playerState?.finished && !this.playerFinished) {
      this.playerFinished = true;
      this.state = 'finished';
    }
  }

  updatePositions(karts) {
    this.positions = [...karts].sort((a, b) => {
      const progressA = this.checkpoints.getRaceProgress(a.id);
      const progressB = this.checkpoints.getRaceProgress(b.id);
      return progressB - progressA;
    });
  }

  isRunning() {
    return this.state === 'running';
  }

  getCountdownText() {
    if (this.state === 'countdown') {
      const remaining = Math.max(0, this.countdownRemaining);
      if (remaining > 2) return '3';
      if (remaining > 1) return '2';
      return '1';
    }
    if (this.goFlash > 0) return 'GO';
    return '';
  }

  getKartState(kartId) {
    return this.checkpoints.getState(kartId);
  }

  getPosition(kartId) {
    const index = this.positions.findIndex((kart) => kart.id === kartId);
    return index >= 0 ? index + 1 : 1;
  }
}
