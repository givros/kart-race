import * as THREE from 'three';
import { Kart } from './Kart.js';
import { angleDifference, clamp, makeSeededRandom, randomRange, yawFromDirection } from '../utils/math.js';

const tmpTarget = new THREE.Vector3();

export class AIKart extends Kart {
  constructor(index, color, accent) {
    const random = makeSeededRandom(100 + index * 19);
    super(`ai-${index}`, {
      name: `AI ${index}`,
      aiIndex: index,
      color,
      accent,
      maxSpeed: randomRange(random, 52, 59),
      accelerationForce: randomRange(random, 66, 78),
      brakeForce: randomRange(random, 92, 108),
      reverseForce: 22,
      grip: randomRange(random, 14.2, 16.2),
      boostPower: randomRange(random, 28, 36),
    });
    this.random = random;
    this.lineOffset = randomRange(random, -2.2, 2.2);
    this.skill = randomRange(random, 0.92, 1.04);
    this.personalityPhase = randomRange(random, 0, Math.PI * 2);
    this.aiTime = 0;
  }

  computeControls(dt, track, raceRunning) {
    this.aiTime += dt;
    if (!raceRunning) {
      return { throttle: 0, brake: 0, steer: 0, handbrake: false };
    }

    const nearest = track.getRaceInfo
      ? track.getRaceInfo(this.position)
      : track.getNearestInfo(this.position);
    const speed = Math.abs(this.currentSpeed);
    const lookAheadMeters = clamp(24 + speed * 0.82, 28, 82);
    const targetProgress = nearest.progress + lookAheadMeters / track.totalLength;
    const frame = track.getFrameAtProgress(targetProgress);
    const wobble =
      Math.sin(this.aiTime * (0.8 + this.aiIndex * 0.06) + this.personalityPhase) * 0.75;
    tmpTarget.copy(frame.point).addScaledVector(frame.normal, this.lineOffset + wobble);

    const toTarget = tmpTarget.sub(this.position).setY(0);
    const desiredYaw = yawFromDirection(toTarget.normalize());
    const yawError = angleDifference(desiredYaw, this.yaw);
    const steer = clamp(yawError / 0.5, -1, 1);

    const curvature = track.getCurvatureAhead(nearest.progress);
    const offTrackPenalty = Math.abs(nearest.lateral) > track.halfWidth ? 0.82 : 1;
    const targetSpeed = clamp(
      this.maxSpeed * this.skill * offTrackPenalty * (1 - curvature * 0.54),
      30,
      this.maxSpeed * this.skill,
    );
    const throttle = speed < targetSpeed - 1.2 ? 1 : curvature < 0.25 ? 0.78 : 0.32;
    const brake = speed > targetSpeed + 3.4 ? clamp((speed - targetSpeed) / 18, 0, 1) : 0;
    const handbrake = curvature > 0.62 && speed > 34 && Math.abs(steer) > 0.58;

    return { throttle, brake, steer, handbrake };
  }
}
