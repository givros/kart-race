import * as THREE from 'three';
import { damp, forwardFromYaw } from '../utils/math.js';

const forward = new THREE.Vector3();
const desired = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const shakeOffset = new THREE.Vector3();
const chaseTargetOffset = new THREE.Vector3();

const CHASE_FOLLOW_DISTANCE = 10.6;
const CHASE_HEIGHT = 5.25;
const CHASE_FOV = 61;
const CHASE_LOOK_AHEAD = 8.5;
const CHASE_LOOK_HEIGHT = 1.25;
const CHASE_ROTATION_DAMPING = 13;

export class CameraController {
  constructor(camera, track) {
    this.camera = camera;
    this.track = track;
    this.mode = 'chase';
    this.smoothedLookAt = new THREE.Vector3(0, 0, 0);
    this.chaseOffset = new THREE.Vector3(0, CHASE_HEIGHT, -CHASE_FOLLOW_DISTANCE);
    this.orbitAngle = 0;
  }

  toggleTopDown() {
    this.mode = this.mode === 'top' ? 'chase' : 'top';
  }

  toggleDebugOrbit() {
    this.mode = this.mode === 'orbit' ? 'chase' : 'orbit';
  }

  update(dt, kart) {
    if (this.mode === 'top') {
      this.updateTopDown(dt, kart);
    } else if (this.mode === 'orbit') {
      this.updateOrbit(dt);
    } else {
      this.updateChase(dt, kart);
    }
  }

  updateChase(dt, kart) {
    forwardFromYaw(kart.yaw, forward);
    chaseTargetOffset
      .copy(forward)
      .multiplyScalar(-CHASE_FOLLOW_DISTANCE);
    chaseTargetOffset.y = CHASE_HEIGHT;

    this.chaseOffset.lerp(
      chaseTargetOffset,
      1 - Math.exp(-dt * CHASE_ROTATION_DAMPING),
    );

    const horizontalLength = Math.hypot(this.chaseOffset.x, this.chaseOffset.z);
    if (horizontalLength > 0.0001) {
      this.chaseOffset.x = (this.chaseOffset.x / horizontalLength) * CHASE_FOLLOW_DISTANCE;
      this.chaseOffset.z = (this.chaseOffset.z / horizontalLength) * CHASE_FOLLOW_DISTANCE;
    } else {
      this.chaseOffset.x = chaseTargetOffset.x;
      this.chaseOffset.z = chaseTargetOffset.z;
    }
    this.chaseOffset.y = CHASE_HEIGHT;

    desired
      .copy(kart.position)
      .add(this.chaseOffset);

    const shake = Math.min(kart.collisionImpulse, 1);
    if (shake > 0.01) {
      shakeOffset.set(
        (Math.random() - 0.5) * shake * 0.55,
        (Math.random() - 0.5) * shake * 0.28,
        (Math.random() - 0.5) * shake * 0.55,
      );
      desired.add(shakeOffset);
      kart.collisionImpulse = Math.max(0, kart.collisionImpulse - dt * 2.8);
    }

    this.camera.position.copy(desired);
    lookTarget
      .copy(kart.position)
      .addScaledVector(forward, CHASE_LOOK_AHEAD)
      .add(new THREE.Vector3(0, CHASE_LOOK_HEIGHT, 0));
    this.smoothedLookAt.lerp(lookTarget, 1 - Math.exp(-dt * 8));
    this.camera.lookAt(this.smoothedLookAt);
    this.camera.fov = damp(this.camera.fov, CHASE_FOV, 5, dt);
    this.camera.updateProjectionMatrix();
  }

  updateTopDown(dt, kart) {
    const size = new THREE.Vector3();
    this.track.bounds.getSize(size);
    const height = Math.max(230, Math.max(size.x, size.z) * 0.82);
    desired.copy(kart.position).add(new THREE.Vector3(0, height, 0.01));
    this.camera.position.lerp(desired, 1 - Math.exp(-dt * 5));
    this.smoothedLookAt.lerp(kart.position, 1 - Math.exp(-dt * 9));
    this.camera.lookAt(this.smoothedLookAt);
    this.camera.fov = damp(this.camera.fov, 53, 5, dt);
    this.camera.updateProjectionMatrix();
  }

  updateOrbit(dt) {
    this.orbitAngle += dt * 0.16;
    const center = this.track.center;
    const size = new THREE.Vector3();
    this.track.bounds.getSize(size);
    const radius = Math.max(size.x, size.z) * 0.62;
    desired.set(
      center.x + Math.cos(this.orbitAngle) * radius,
      radius * 0.52,
      center.z + Math.sin(this.orbitAngle) * radius,
    );
    this.camera.position.lerp(desired, 1 - Math.exp(-dt * 3));
    this.smoothedLookAt.lerp(center, 1 - Math.exp(-dt * 4));
    this.camera.lookAt(this.smoothedLookAt);
    this.camera.fov = damp(this.camera.fov, 48, 4, dt);
    this.camera.updateProjectionMatrix();
  }
}
