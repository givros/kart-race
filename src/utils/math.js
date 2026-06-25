import * as THREE from 'three';

export const TAU = Math.PI * 2;

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function normalizeAngle(angle) {
  let result = angle % TAU;
  if (result > Math.PI) result -= TAU;
  if (result < -Math.PI) result += TAU;
  return result;
}

export function angleDifference(target, current) {
  return normalizeAngle(target - current);
}

export function lerpAngle(current, target, t) {
  return current + angleDifference(target, current) * t;
}

export function signedProgressDelta(previous, current) {
  let delta = current - previous;
  if (delta > 0.5) delta -= 1;
  if (delta < -0.5) delta += 1;
  return delta;
}

export function crossedForward(previous, current, target) {
  if (signedProgressDelta(previous, current) <= 0.00001) return false;
  if (current >= previous) {
    return target > previous && target <= current;
  }
  return target > previous || target <= current;
}

export function formatRaceTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '--';
  const minutes = Math.floor(seconds / 60);
  const whole = Math.floor(seconds % 60);
  const millis = Math.floor((seconds - Math.floor(seconds)) * 1000);
  return `${minutes}:${whole.toString().padStart(2, '0')}.${millis
    .toString()
    .padStart(3, '0')}`;
}

export function yawFromDirection(direction) {
  return Math.atan2(direction.x, direction.z);
}

export function forwardFromYaw(yaw, target = new THREE.Vector3()) {
  return target.set(Math.sin(yaw), 0, Math.cos(yaw));
}

export function makeSeededRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function randomRange(random, min, max) {
  return min + (max - min) * random();
}

export function wrap01(value) {
  const wrapped = value % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

export function closestPointOnSegment2D(point, a, b, target = new THREE.Vector3()) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const apx = point.x - a.x;
  const apz = point.z - a.z;
  const abLengthSq = abx * abx + abz * abz;
  const t = abLengthSq > 0 ? clamp((apx * abx + apz * abz) / abLengthSq, 0, 1) : 0;
  target.set(a.x + abx * t, 0, a.z + abz * t);
  return t;
}
