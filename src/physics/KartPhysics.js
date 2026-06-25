import * as THREE from 'three';
import { clamp, damp } from '../utils/math.js';

const forward = new THREE.Vector3();
const lateralVelocity = new THREE.Vector3();
const normal = new THREE.Vector3();
const wallTangent = new THREE.Vector3();

export class KartPhysics {
  updateKart(kart, controls, track, dt) {
    const surface = track.getSurfaceInfo(kart.position);
    const stunned = kart.stunTimer > 0;
    const slowed = kart.slowTimer > 0;
    const activeControls = stunned
      ? { throttle: 0, brake: 0.25, steer: Math.sin(performance.now() * 0.018), handbrake: false }
      : controls;
    kart.getForwardVector(forward);

    const forwardSpeed = kart.velocity.dot(forward);
    lateralVelocity.copy(kart.velocity).addScaledVector(forward, -forwardSpeed);

    const targetSteer = clamp(activeControls.steer ?? 0, -1, 1);
    kart.steeringAngle = damp(kart.steeringAngle, targetSteer, 16, dt);

    const absForwardSpeed = Math.abs(forwardSpeed);
    const wantsDrift =
      Boolean(activeControls.handbrake) &&
      !stunned &&
      absForwardSpeed > 9 &&
      Math.abs(kart.steeringAngle) > 0.18 &&
      surface.onTrack;
    if (wantsDrift) {
      if (!kart.wasDrifting) {
        kart.driftCharge = 0;
        kart.driftDirection = Math.sign(kart.steeringAngle) || 1;
      }
      kart.wasDrifting = true;
      kart.driftCharge = Math.min(
        2.4,
        kart.driftCharge + dt * (0.65 + absForwardSpeed / 34 + Math.abs(kart.steeringAngle) * 0.9),
      );
    } else {
      if (kart.wasDrifting && kart.driftCharge > 0.55) {
        kart.boostTimer = Math.max(kart.boostTimer, kart.driftCharge > 1.35 ? 1.0 : 0.48);
      }
      kart.wasDrifting = false;
      kart.driftDirection = 0;
      kart.driftCharge = Math.max(0, kart.driftCharge - dt * 2.8);
    }

    kart.boostTimer = Math.max(0, kart.boostTimer - dt);

    const turnSlip = clamp(Math.abs(kart.steeringAngle) * absForwardSpeed / 42, 0, 0.7);
    const driftGripScale = wantsDrift ? 0.42 : 1.1 - turnSlip * 0.28;
    const grip = kart.grip * surface.gripFactor * driftGripScale;
    kart.driftValue = wantsDrift ? clamp(kart.driftCharge / 1.35, 0.25, 1) : clamp(turnSlip, 0, 1);
    kart.velocity.addScaledVector(lateralVelocity, -clamp(grip * dt, 0, 0.96));

    let force = 0;
    const throttle = clamp(activeControls.throttle ?? 0, 0, 1);
    const brake = clamp(activeControls.brake ?? 0, 0, 1);
    if (throttle > 0) {
      force += kart.accelerationForce * throttle * (forwardSpeed < -1 ? 1.25 : 1);
    }
    if (brake > 0) {
      force -= forwardSpeed > 1.2 ? kart.brakeForce * brake : kart.reverseForce * brake;
    }
    if (kart.boostTimer > 0) {
      force += kart.boostPower * 1.45;
    }

    kart.velocity.addScaledVector(forward, force * dt);

    const coinBonus = (kart.coinCount ?? 0) * 0.42;
    const statusSpeedFactor = slowed ? 0.64 : 1;
    const invincibleBonus = kart.invincibleTimer > 0 ? 5 : 0;
    const maxSpeed = (
      kart.maxSpeed +
      coinBonus +
      invincibleBonus +
      (kart.boostTimer > 0 ? 16 : 0)
    ) * surface.speedFactor * statusSpeedFactor;
    const newForwardSpeed = kart.velocity.dot(forward);
    if (newForwardSpeed > maxSpeed) {
      kart.velocity.addScaledVector(forward, -(newForwardSpeed - maxSpeed) * 0.55);
    } else if (newForwardSpeed < -11) {
      kart.velocity.addScaledVector(forward, -11 - newForwardSpeed);
    }

    const coastingDrag = throttle > 0 || kart.boostTimer > 0 ? 0 : 0.16;
    const drag = 0.055 + surface.drag * 0.55 + coastingDrag + (wantsDrift ? 0.08 : 0) + (stunned ? 0.8 : 0);
    kart.velocity.multiplyScalar(Math.max(0, 1 - drag * dt));

    const absSpeed = Math.abs(kart.velocity.dot(forward));
    const steerPower = clamp(absSpeed / 8, 0.38, 1.15);
    const reverseSign = kart.velocity.dot(forward) >= 0 ? 1 : -1;
    const driftTurn = wantsDrift ? 1.45 : 1;
    const yawRate = clamp(
      kart.steeringAngle *
      reverseSign *
      steerPower *
      (1.15 + absSpeed * 0.035) *
      driftTurn,
      wantsDrift ? -3.15 : -2.35,
      wantsDrift ? 3.15 : 2.35,
    );
    kart.yaw += yawRate * dt;
    if (stunned) {
      kart.yaw += Math.sign(kart.steeringAngle || 1) * dt * 5.4;
    }

    const previous = kart.position.clone();
    kart.position.addScaledVector(kart.velocity, dt);
    kart.position.y = 0.18;

    const impact = this.resolveTrackCollision(kart, track);
    if (impact > 0) {
      kart.collisionImpulse = Math.max(kart.collisionImpulse, impact);
    }

    const hazard = typeof track.getFallHazard === 'function'
      ? track.getFallHazard(kart.position)
      : null;
    if (hazard && (kart.jumpTimer ?? 0) <= 0.04 && kart.invincibleTimer <= 0) {
      this.respawnKart(kart, track, hazard);
      kart.collisionImpulse = Math.max(kart.collisionImpulse, 1);
    }

    const moved = previous.distanceTo(kart.position);
    kart.distanceDriven += moved;
    kart.currentSpeed = kart.velocity.dot(kart.getForwardVector(forward));
  }

  resolveTrackCollision(kart, track) {
    const info = typeof track.getSurfaceInfo === 'function'
      ? track.getSurfaceInfo(kart.position)
      : track.getNearestInfo(kart.position);
    const maxLateral =
      info.maxDriveableHalfWidth ??
      track.driveableHalfWidth ??
      track.halfWidth - 0.45;
    const absLateral = Math.abs(info.lateral);
    if (absLateral <= maxLateral) return 0;

    const side = Math.sign(info.lateral) || 1;
    kart.position.copy(info.center).addScaledVector(info.normal, side * maxLateral);
    kart.position.y = 0.18;

    normal.copy(info.normal).multiplyScalar(side);
    const overshoot = absLateral - maxLateral;
    const tangentSpeed = kart.velocity.dot(info.tangent);
    const outwardSpeed = kart.velocity.dot(normal);
    const incomingSpeed = Math.max(0, outwardSpeed);
    const tangentLoss = clamp(0.12 + overshoot * 0.035 + incomingSpeed * 0.008, 0.12, 0.38);
    const inwardBounce = Math.max(1.05, incomingSpeed * 0.2 + overshoot * 1.1);

    wallTangent.copy(info.tangent).multiplyScalar(tangentSpeed * (1 - tangentLoss));
    kart.velocity.copy(wallTangent).addScaledVector(normal, -inwardBounce);
    kart.yaw += side * Math.sign(tangentSpeed || 1) * clamp(incomingSpeed * 0.012 + overshoot * 0.025, 0.035, 0.24);
    kart.driftCharge = Math.max(0, kart.driftCharge - 0.55);
    kart.boostTimer = Math.min(kart.boostTimer, 0.18);

    return clamp((incomingSpeed + overshoot * 2) / 24, 0.1, 1);
  }

  respawnKart(kart, track, hazard) {
    const pose = track.getResetPose(hazard.info?.center ?? kart.position);
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
    kart.stunTimer = Math.max(kart.stunTimer, 0.45);
  }

  resolveKartCollisions(karts) {
    for (let i = 0; i < karts.length; i += 1) {
      for (let j = i + 1; j < karts.length; j += 1) {
        const a = karts[i];
        const b = karts[j];
        const dx = a.position.x - b.position.x;
        const dz = a.position.z - b.position.z;
        const distanceSq = dx * dx + dz * dz;
        const minDistance = a.collisionRadius + b.collisionRadius;
        if (distanceSq >= minDistance * minDistance || distanceSq <= 0.0001) continue;

        const distance = Math.sqrt(distanceSq);
        normal.set(dx / distance, 0, dz / distance);
        const overlap = minDistance - distance;
        a.position.addScaledVector(normal, overlap * 0.52);
        b.position.addScaledVector(normal, -overlap * 0.52);

        const relativeVelocity = a.velocity.clone().sub(b.velocity);
        const closingSpeed = relativeVelocity.dot(normal);
        if (closingSpeed < 0) {
          const impulse = -closingSpeed * 0.58;
          a.velocity.addScaledVector(normal, impulse);
          b.velocity.addScaledVector(normal, -impulse);
        }
        a.velocity.multiplyScalar(0.92);
        b.velocity.multiplyScalar(0.92);
        const impulseAmount = clamp(Math.abs(closingSpeed) / 22, 0.1, 0.85);
        a.collisionImpulse = Math.max(a.collisionImpulse, impulseAmount);
        b.collisionImpulse = Math.max(b.collisionImpulse, impulseAmount);
      }
    }
  }
}
