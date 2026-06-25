import { crossedForward } from '../utils/math.js';

export class CheckpointSystem {
  constructor(track, totalLaps = 3) {
    this.track = track;
    this.totalLaps = totalLaps;
    this.checkpoints = [
      track.finishProgress ?? 0,
      0.16,
      0.28,
      0.4,
      0.52,
      0.64,
      0.76,
      0.88,
    ];
    this.states = new Map();
  }

  reset(karts) {
    this.states.clear();
    for (const kart of karts) {
      const progress = this.track.getRaceInfo
        ? this.track.getRaceInfo(kart.position).progress
        : this.track.getNearestInfo(kart.position).progress;
      this.states.set(kart.id, {
        lap: 1,
        completedLaps: 0,
        nextCheckpoint: 1,
        lastProgress: progress,
        progress,
        raceProgress: progress,
        lastLapTime: 0,
        bestLapTime: 0,
        lapStartTime: 0,
        finished: false,
        finishTime: 0,
      });
    }
  }

  snapshot() {
    return [...this.states.entries()].map(([id, state]) => ({
      id,
      ...state,
    }));
  }

  restore(snapshot, karts) {
    this.reset(karts);
    if (!Array.isArray(snapshot)) return;

    const knownKartIds = new Set(karts.map((kart) => kart.id));
    for (const savedState of snapshot) {
      if (!savedState?.id || !knownKartIds.has(savedState.id)) continue;
      this.states.set(savedState.id, {
        lap: Number(savedState.lap ?? 1),
        completedLaps: Number(savedState.completedLaps ?? 0),
        nextCheckpoint: Number(savedState.nextCheckpoint ?? 1),
        lastProgress: Number(savedState.lastProgress ?? savedState.progress ?? 0),
        progress: Number(savedState.progress ?? 0),
        raceProgress: Number(savedState.raceProgress ?? savedState.progress ?? 0),
        lastLapTime: Number(savedState.lastLapTime ?? 0),
        bestLapTime: Number(savedState.bestLapTime ?? 0),
        lapStartTime: Number(savedState.lapStartTime ?? 0),
        finished: Boolean(savedState.finished),
        finishTime: Number(savedState.finishTime ?? 0),
      });
    }
  }

  updateKart(kart, raceTime) {
    const state = this.states.get(kart.id);
    if (!state || state.finished) return state;

    const progress = this.track.getRaceInfo
      ? this.track.getRaceInfo(kart.position).progress
      : this.track.getNearestInfo(kart.position).progress;
    const previousProgress = state.lastProgress;
    const measure = this.measureCheckpoint(kart.position, state.nextCheckpoint);
    const surface = this.track.getSurfaceInfo
      ? this.track.getSurfaceInfo(kart.position)
      : null;
    const gateWidth =
      (surface?.maxDriveableHalfWidth ?? this.track.halfWidth) +
      (surface?.onShortcut ? 3.5 : 5.5);
    const checkpointProgress = this.checkpoints[state.nextCheckpoint];
    const crossedGate =
      crossedForward(previousProgress, progress, checkpointProgress) &&
      Math.abs(measure.lateral) <= gateWidth;

    if (crossedGate) {
      if (state.nextCheckpoint === 0) {
        const lapTime = raceTime - state.lapStartTime;
        state.lastLapTime = lapTime;
        state.bestLapTime =
          state.bestLapTime === 0 ? lapTime : Math.min(state.bestLapTime, lapTime);
        state.completedLaps += 1;

        if (state.completedLaps >= this.totalLaps) {
          state.lap = this.totalLaps;
          state.finished = true;
          state.finishTime = raceTime;
          state.raceProgress = this.totalLaps + progress;
        } else {
          state.lap = state.completedLaps + 1;
          state.lapStartTime = raceTime;
          state.nextCheckpoint = 1;
        }
      } else {
        state.nextCheckpoint += 1;
        if (state.nextCheckpoint >= this.checkpoints.length) {
          state.nextCheckpoint = 0;
        }
      }
    }

    state.progress = progress;
    state.raceProgress = state.finished
      ? this.totalLaps + progress
      : state.completedLaps + progress;
    state.lastProgress = progress;
    return state;
  }

  measureCheckpoint(position, checkpointIndex) {
    const frame = this.track.getFrameAtProgress(this.checkpoints[checkpointIndex]);
    const dx = position.x - frame.point.x;
    const dz = position.z - frame.point.z;
    return {
      longitudinal: dx * frame.tangent.x + dz * frame.tangent.z,
      lateral: dx * frame.normal.x + dz * frame.normal.z,
    };
  }

  getState(kartId) {
    return this.states.get(kartId);
  }

  getRaceProgress(kartId) {
    return this.states.get(kartId)?.raceProgress ?? 0;
  }
}
