import * as THREE from 'three';
import {
  clamp,
  closestPointOnSegment2D,
  wrap01,
  yawFromDirection,
} from '../utils/math.js';

const tmpPoint = new THREE.Vector3();
const tmpPointB = new THREE.Vector3();

function setShadow(object, cast = true, receive = true) {
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = cast;
      child.receiveShadow = receive;
    }
  });
}

function makeSignTexture(text, bg = '#f4f0dc', fg = '#1a1d20') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#20252a';
  ctx.fillRect(0, 0, canvas.width, 16);
  ctx.fillRect(0, canvas.height - 16, canvas.width, 16);
  ctx.font = '900 56px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fg;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeStartBannerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffca3a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#101418';
  ctx.fillRect(0, 0, canvas.width, 22);
  ctx.fillRect(0, canvas.height - 22, canvas.width, 22);
  for (let i = 0; i < 18; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? '#101418' : '#f7f3df';
    ctx.fillRect(i * 42, 22, 42, 16);
    ctx.fillStyle = i % 2 === 0 ? '#f7f3df' : '#101418';
    ctx.fillRect(i * 42, canvas.height - 38, 42, 16);
  }
  ctx.font = '1000 118px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#101418';
  ctx.fillText('START', canvas.width / 2, canvas.height / 2 + 5);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class Track {
  constructor(scene) {
    this.scene = scene;
    this.width = 28;
    this.halfWidth = this.width / 2;
    this.runoffWidth = 12;
    this.driveableHalfWidth = this.halfWidth - 0.45;
    this.sampleCount = 1800;
    this.finishProgress = 0.035;
    this.gridProgress = this.finishProgress + 0.03;
    this.center = new THREE.Vector3(0, 0, 0);
    this.bounds = new THREE.Box3();

    this.controlPoints = [
      [-360, -960],
      [-80, -1000],
      [260, -985],
      [610, -910],
      [890, -755],
      [1045, -520],
      [1010, -280],
      [800, -120],
      [520, -85],
      [355, 55],
      [505, 230],
      [820, 325],
      [1080, 520],
      [1195, 790],
      [1075, 1050],
      [765, 1165],
      [430, 1120],
      [175, 930],
      [-65, 1015],
      [-365, 1180],
      [-720, 1110],
      [-970, 885],
      [-1045, 610],
      [-905, 380],
      [-700, 240],
      [-940, 70],
      [-1180, -185],
      [-1165, -500],
      [-925, -720],
      [-620, -780],
      [-430, -610],
      [-250, -700],
      [-205, -875],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z));

    this.biomes = [
      { name: 'Circuit', start: 0.0, end: 0.16, road: 0x262d2b, runoff: 0xc69249, ground: 0x69b956, speed: 1, grip: 1, drag: 0.15 },
      { name: 'City', start: 0.16, end: 0.31, road: 0x30383e, runoff: 0x8d9699, ground: 0x68727a, speed: 1.02, grip: 0.98, drag: 0.14 },
      { name: 'Snow', start: 0.31, end: 0.47, road: 0xdde9ee, runoff: 0xf0f6fa, ground: 0xd9eff8, speed: 0.92, grip: 0.72, drag: 0.23 },
      { name: 'Dirt', start: 0.47, end: 0.63, road: 0x8a5c36, runoff: 0xa97645, ground: 0x6f563f, speed: 0.95, grip: 0.8, drag: 0.34 },
      { name: 'Sand', start: 0.63, end: 0.8, road: 0xd4a75c, runoff: 0xe1bf75, ground: 0xe3c36f, speed: 0.86, grip: 0.69, drag: 0.48 },
      { name: 'Grass', start: 0.8, end: 0.93, road: 0x4f7f4a, runoff: 0x77ad58, ground: 0x5fb659, speed: 0.94, grip: 0.88, drag: 0.28 },
      { name: 'Circuit', start: 0.93, end: 1.0, road: 0x252b2c, runoff: 0xc69249, ground: 0x6fbd58, speed: 1, grip: 1, drag: 0.15 },
    ];

    this.shortcutZones = [
      { name: 'City alley', start: 0.19, end: 0.236, side: -1, inner: this.halfWidth + 0.7, outer: this.halfWidth + 13.5, speed: 0.94, grip: 0.92, drag: 0.24, color: 0x414a4d },
      { name: 'Snow ridge', start: 0.386, end: 0.432, side: 1, inner: this.halfWidth + 0.8, outer: this.halfWidth + 15.0, speed: 0.9, grip: 0.62, drag: 0.34, color: 0xc9dde6 },
      { name: 'Dune cut', start: 0.675, end: 0.738, side: -1, inner: this.halfWidth + 0.8, outer: this.halfWidth + 16.0, speed: 0.82, grip: 0.66, drag: 0.6, color: 0xc9974a },
      { name: 'Forest trail', start: 0.805, end: 0.858, side: 1, inner: this.halfWidth + 0.7, outer: this.halfWidth + 14.5, speed: 0.93, grip: 0.86, drag: 0.33, color: 0x5f8147 },
    ];

    this.jumpHazards = [
      { name: 'City canal gap', start: 0.255, end: 0.266, side: 0, halfWidth: this.halfWidth - 2 },
      { name: 'Snow ravine', start: 0.445, end: 0.457, side: 0, halfWidth: this.halfWidth - 1.5 },
      { name: 'Canyon washout', start: 0.56, end: 0.573, side: 0, halfWidth: this.halfWidth - 2 },
      { name: 'Dune canyon', start: 0.765, end: 0.778, side: 0, halfWidth: this.halfWidth - 1.5 },
    ];

    this.bounds.setFromPoints(this.controlPoints);
    this.bounds.getCenter(this.center);

    this.curve = new THREE.CatmullRomCurve3(
      this.controlPoints,
      true,
      'catmullrom',
      0.42,
    );
    this.samples = [];
    this.cumulativeLengths = [];
    this.totalLength = 1;
    this.generateSamples();
    this.createTrackMeshes();
    this.createShortcuts();
    this.createJumpHazards();
    this.createStartFinishGantry();
    this.createVisibleStartGate();
    this.createStartGridMarkers();
  }

  generateSamples() {
    this.samples.length = 0;
    this.cumulativeLengths.length = 0;

    for (let i = 0; i < this.sampleCount; i += 1) {
      const progress = i / this.sampleCount;
      const point = this.curve.getPointAt(progress);
      const tangent = this.curve.getTangentAt(progress).setY(0).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      this.samples.push({ point, tangent, normal, progress, distance: 0 });
    }

    let distance = 0;
    for (let i = 0; i < this.sampleCount; i += 1) {
      const current = this.samples[i].point;
      const next = this.samples[(i + 1) % this.sampleCount].point;
      this.samples[i].distance = distance;
      this.cumulativeLengths[i] = distance;
      distance += current.distanceTo(next);
    }
    this.totalLength = distance;
  }

  createTrackMeshes() {
    const trackSize = new THREE.Vector3();
    this.bounds.getSize(trackSize);
    const baseGround = new THREE.Mesh(
      new THREE.PlaneGeometry(trackSize.x + 7600, trackSize.z + 7600, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0x5faa58,
        roughness: 0.95,
        metalness: 0,
        flatShading: true,
      }),
    );
    baseGround.rotation.x = -Math.PI / 2;
    baseGround.position.set(this.center.x, -0.1, this.center.z);
    baseGround.receiveShadow = true;
    this.scene.add(baseGround);

    this.createBiomeGroundPatches();

    for (const biome of this.biomes) {
      const roadMat = new THREE.MeshStandardMaterial({
        color: biome.road,
        roughness: biome.name === 'City' ? 0.58 : 0.82,
        metalness: biome.name === 'City' ? 0.03 : 0.01,
        side: THREE.DoubleSide,
        flatShading: true,
      });
      const runoffMat = new THREE.MeshStandardMaterial({
        color: biome.runoff,
        roughness: 1,
        side: THREE.DoubleSide,
        flatShading: true,
      });

      const leftRunoff = new THREE.Mesh(
        this.createSegmentStripGeometry(
          biome.start,
          biome.end,
          this.halfWidth,
          this.halfWidth + this.runoffWidth,
          0,
        ),
        runoffMat,
      );
      const rightRunoff = new THREE.Mesh(
        this.createSegmentStripGeometry(
          biome.start,
          biome.end,
          -this.halfWidth - this.runoffWidth,
          -this.halfWidth,
          0,
        ),
        runoffMat,
      );
      const road = new THREE.Mesh(
        this.createSegmentStripGeometry(
          biome.start,
          biome.end,
          -this.halfWidth,
          this.halfWidth,
          0.025,
        ),
        roadMat,
      );
      leftRunoff.receiveShadow = true;
      rightRunoff.receiveShadow = true;
      road.receiveShadow = true;
      this.scene.add(leftRunoff, rightRunoff, road);
    }

    this.createCurbs();
  }

  createStripGeometry(leftOffset, rightOffset, y) {
    const positions = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i < this.sampleCount; i += 1) {
      const sample = this.samples[i];
      const left = sample.point
        .clone()
        .addScaledVector(sample.normal, leftOffset)
        .setY(y);
      const right = sample.point
        .clone()
        .addScaledVector(sample.normal, rightOffset)
        .setY(y);

      positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
      const v = sample.distance / 18;
      uvs.push(0, v, 1, v);
    }

    for (let i = 0; i < this.sampleCount; i += 1) {
      const next = (i + 1) % this.sampleCount;
      const a = i * 2;
      const b = i * 2 + 1;
      const c = next * 2;
      const d = next * 2 + 1;
      indices.push(a, c, b, b, c, d);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  createSegmentStripGeometry(startProgress, endProgress, leftOffset, rightOffset, y) {
    const positions = [];
    const uvs = [];
    const indices = [];
    const start = wrap01(startProgress);
    const end = endProgress >= 1 ? endProgress : wrap01(endProgress);
    const span = end >= start ? end - start : end + 1 - start;
    const steps = Math.max(6, Math.ceil(span * this.sampleCount));

    for (let i = 0; i <= steps; i += 1) {
      const p = wrap01(start + (span * i) / steps);
      const frame = this.getFrameAtProgress(p);
      const left = frame.point
        .clone()
        .addScaledVector(frame.normal, leftOffset)
        .setY(y);
      const right = frame.point
        .clone()
        .addScaledVector(frame.normal, rightOffset)
        .setY(y);
      positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
      const v = frame.distance / 18;
      uvs.push(0, v, 1, v);
    }

    for (let i = 0; i < steps; i += 1) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      indices.push(a, c, b, b, c, d);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  createBiomeGroundPatches() {
    for (const biome of this.biomes) {
      const groundMat = new THREE.MeshStandardMaterial({
        color: biome.ground,
        roughness: 1,
        side: THREE.DoubleSide,
        flatShading: true,
      });
      const outer = this.halfWidth + this.runoffWidth + 90;
      const leftGround = new THREE.Mesh(
        this.createSegmentStripGeometry(
          biome.start,
          biome.end,
          this.halfWidth + this.runoffWidth,
          outer,
          -0.055,
        ),
        groundMat,
      );
      const rightGround = new THREE.Mesh(
        this.createSegmentStripGeometry(
          biome.start,
          biome.end,
          -outer,
          -this.halfWidth - this.runoffWidth,
          -0.055,
        ),
        groundMat,
      );
      leftGround.receiveShadow = true;
      rightGround.receiveShadow = true;
      this.scene.add(leftGround, rightGround);
    }
  }

  prepareShortcutZone(zone) {
    if (zone.shortcutStart) return zone;
    const startFrame = this.getFrameAtProgress(zone.start);
    const endFrame = this.getFrameAtProgress(zone.end);
    const centerLateral = zone.side * ((zone.inner + zone.outer) / 2);
    const halfWidth = Math.max(4.5, (zone.outer - zone.inner) / 2);
    const start = startFrame.point
      .clone()
      .addScaledVector(startFrame.normal, centerLateral)
      .setY(0.04);
    const end = endFrame.point
      .clone()
      .addScaledVector(endFrame.normal, centerLateral)
      .setY(0.04);
    const tangent = end.clone().sub(start).setY(0).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    zone.shortcutStart = start;
    zone.shortcutEnd = end;
    zone.shortcutTangent = tangent;
    zone.shortcutNormal = normal;
    zone.shortcutHalfWidth = halfWidth;
    return zone;
  }

  createShortcuts() {
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0xf4d33d,
      roughness: 0.68,
      flatShading: true,
    });

    for (const zone of this.shortcutZones) {
      this.prepareShortcutZone(zone);
      const surfaceMat = new THREE.MeshStandardMaterial({
        color: zone.color,
        roughness: 0.94,
        side: THREE.DoubleSide,
        flatShading: true,
      });
      const leftStart = zone.shortcutStart.clone().addScaledVector(zone.shortcutNormal, zone.shortcutHalfWidth);
      const rightStart = zone.shortcutStart.clone().addScaledVector(zone.shortcutNormal, -zone.shortcutHalfWidth);
      const leftEnd = zone.shortcutEnd.clone().addScaledVector(zone.shortcutNormal, zone.shortcutHalfWidth);
      const rightEnd = zone.shortcutEnd.clone().addScaledVector(zone.shortcutNormal, -zone.shortcutHalfWidth);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([
        leftStart.x, 0.055, leftStart.z,
        rightStart.x, 0.055, rightStart.z,
        leftEnd.x, 0.055, leftEnd.z,
        rightEnd.x, 0.055, rightEnd.z,
      ], 3));
      geometry.setIndex([0, 2, 1, 1, 2, 3]);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, surfaceMat);
      mesh.receiveShadow = true;
      this.scene.add(mesh);

      const length = zone.shortcutStart.distanceTo(zone.shortcutEnd);
      const edgeGeo = new THREE.BoxGeometry(0.42, 0.22, length);
      for (const side of [-1, 1]) {
        const edge = new THREE.Mesh(edgeGeo, edgeMat);
        edge.position
          .copy(zone.shortcutStart)
          .lerp(zone.shortcutEnd, 0.5)
          .addScaledVector(zone.shortcutNormal, side * (zone.shortcutHalfWidth + 0.15));
        edge.position.y = 0.18;
        edge.rotation.y = yawFromDirection(zone.shortcutTangent);
        edge.castShadow = true;
        edge.receiveShadow = true;
        this.scene.add(edge);
      }
    }
  }

  createJumpHazards() {
    const gapMat = new THREE.MeshStandardMaterial({
      color: 0x111820,
      emissive: 0x07131d,
      emissiveIntensity: 0.28,
      roughness: 0.86,
      side: THREE.DoubleSide,
      flatShading: true,
    });
    const warningMat = new THREE.MeshStandardMaterial({
      color: 0xffca3a,
      roughness: 0.65,
      flatShading: true,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x22262b,
      roughness: 0.72,
      flatShading: true,
    });

    for (const hazard of this.jumpHazards) {
      const gap = new THREE.Mesh(
        this.createSegmentStripGeometry(
          hazard.start,
          hazard.end,
          -hazard.halfWidth,
          hazard.halfWidth,
          0.075,
        ),
        gapMat,
      );
      gap.receiveShadow = true;
      this.scene.add(gap);

      for (const p of [hazard.start, hazard.end]) {
        const frame = this.getFrameAtProgress(p);
        const plank = new THREE.Mesh(
          new THREE.BoxGeometry(hazard.halfWidth * 2, 0.18, 0.52),
          warningMat,
        );
        plank.position.copy(frame.point);
        plank.position.y = 0.18;
        plank.rotation.y = yawFromDirection(frame.tangent) + Math.PI / 2;
        plank.castShadow = true;
        plank.receiveShadow = true;
        this.scene.add(plank);

        for (const side of [-1, 1]) {
          const block = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 0.8, 1.2),
            darkMat,
          );
          block.position
            .copy(frame.point)
            .addScaledVector(frame.normal, side * (hazard.halfWidth + 1.4));
          block.position.y = 0.4;
          block.rotation.y = yawFromDirection(frame.tangent);
          block.castShadow = true;
          block.receiveShadow = true;
          this.scene.add(block);
        }
      }
    }
  }

  createCurbs() {
    const red = new THREE.MeshStandardMaterial({ color: 0xd62929, roughness: 0.72, flatShading: true });
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f2e9, roughness: 0.7, flatShading: true });
    const curbGeometry = new THREE.BoxGeometry(1.24, 0.12, 4.6);
    const ranges = [
      [0.12, 0.245],
      [0.31, 0.445],
      [0.49, 0.645],
      [0.73, 0.895],
    ];

    let blockIndex = 0;
    for (const [start, end] of ranges) {
      for (let p = start; p < end; p += 0.0135) {
        for (const side of [-1, 1]) {
          const frame = this.getFrameAtProgress(p);
          const mesh = new THREE.Mesh(
            curbGeometry,
            blockIndex % 2 === 0 ? red : white,
          );
          mesh.position
            .copy(frame.point)
            .addScaledVector(frame.normal, side * (this.halfWidth + 0.48));
          mesh.position.y = 0.08;
          mesh.rotation.y = yawFromDirection(frame.tangent);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          this.scene.add(mesh);
        }
        blockIndex += 1;
      }
    }
  }

  createStartFinishGantry() {
    const frame = this.getFrameAtProgress(this.finishProgress);
    const yaw = yawFromDirection(frame.tangent);
    const group = new THREE.Group();
    group.position.copy(frame.point);
    group.rotation.y = yaw;

    const metal = new THREE.MeshStandardMaterial({
      color: 0x262e35,
      roughness: 0.45,
      metalness: 0.45,
      flatShading: true,
    });
    const bannerMat = new THREE.MeshStandardMaterial({
      map: makeSignTexture('START / FINISH', '#f3d33b', '#101418'),
      roughness: 0.64,
      flatShading: true,
    });
    const lightMats = [
      new THREE.MeshStandardMaterial({ color: 0x641b1b, emissive: 0x571010, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x641b1b, emissive: 0x571010, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x173e19, emissive: 0x1f7b28, flatShading: true }),
    ];

    const postGeo = new THREE.BoxGeometry(0.75, 9.2, 0.75);
    const topGeo = new THREE.BoxGeometry(this.width + 7, 0.7, 0.8);
    const bannerGeo = new THREE.BoxGeometry(this.width + 4, 3, 0.35);

    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, metal);
      post.position.set(side * (this.halfWidth + 2.2), 4.6, -0.35);
      group.add(post);
    }

    const top = new THREE.Mesh(topGeo, metal);
    top.position.set(0, 9.2, -0.35);
    group.add(top);

    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    banner.position.set(0, 7.2, -0.52);
    group.add(banner);

    for (let i = 0; i < 3; i += 1) {
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), lightMats[i]);
      light.position.set(-1.2 + i * 1.2, 5.25, -0.9);
      group.add(light);
    }

    setShadow(group);
    this.scene.add(group);

    const chuteMat = new THREE.MeshStandardMaterial({
      color: 0x1c2427,
      roughness: 0.76,
      side: THREE.DoubleSide,
      flatShading: true,
    });
    const chute = new THREE.Mesh(
      this.createSegmentStripGeometry(
        this.finishProgress - 24 / this.totalLength,
        this.finishProgress + 72 / this.totalLength,
        -this.halfWidth,
        this.halfWidth,
        0.055,
      ),
      chuteMat,
    );
    chute.receiveShadow = true;
    this.scene.add(chute);

    const sideLineMat = new THREE.MeshStandardMaterial({
      color: 0xf3d33b,
      roughness: 0.62,
      flatShading: true,
    });
    for (const side of [-1, 1]) {
      const line = new THREE.Mesh(
        this.createSegmentStripGeometry(
          this.finishProgress - 18 / this.totalLength,
          this.finishProgress + 64 / this.totalLength,
          side * (this.halfWidth - 0.9),
          side * (this.halfWidth - 0.35),
          0.075,
        ),
        sideLineMat,
      );
      line.receiveShadow = true;
      this.scene.add(line);
    }

    const checkerCols = 16;
    const checkerRows = 4;
    const checkerGeo = new THREE.BoxGeometry(this.width / checkerCols, 0.052, 1.08);
    const whiteMat = new THREE.MeshStandardMaterial({
      color: 0xf4f4f4,
      roughness: 0.75,
      flatShading: true,
    });
    const blackMat = new THREE.MeshStandardMaterial({
      color: 0x101010,
      roughness: 0.75,
      flatShading: true,
    });

    for (let row = 0; row < checkerRows; row += 1) {
      for (let col = 0; col < checkerCols; col += 1) {
        const marker = new THREE.Mesh(
          checkerGeo,
          (row + col) % 2 === 0 ? whiteMat : blackMat,
        );
        marker.position
          .copy(frame.point)
          .addScaledVector(frame.normal, -this.halfWidth + (col + 0.5) * (this.width / checkerCols))
          .addScaledVector(frame.tangent, (row - checkerRows / 2 + 0.5) * 1.08);
        marker.position.y = 0.105;
        marker.rotation.y = yaw;
        marker.receiveShadow = true;
        this.scene.add(marker);
      }
    }

    const startTextMat = new THREE.MeshStandardMaterial({
      map: makeSignTexture('LAP LINE', '#f3d33b', '#111820'),
      roughness: 0.7,
      side: THREE.DoubleSide,
      flatShading: true,
    });
    const groundSign = new THREE.Mesh(new THREE.PlaneGeometry(12, 3.2), startTextMat);
    groundSign.position
      .copy(frame.point)
      .addScaledVector(frame.tangent, 7.2);
    groundSign.position.y = 0.12;
    groundSign.rotation.x = -Math.PI / 2;
    groundSign.rotation.z = -yaw;
    groundSign.receiveShadow = true;
    this.scene.add(groundSign);
  }

  createVisibleStartGate() {
    const gateProgress = this.gridProgress + 52 / this.totalLength;
    const frame = this.getFrameAtProgress(gateProgress);
    const yaw = yawFromDirection(frame.tangent);
    const group = new THREE.Group();
    group.name = 'Visible_START_Gate';
    group.position.copy(frame.point);
    group.rotation.y = yaw;

    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x111820,
      roughness: 0.58,
      metalness: 0.16,
      flatShading: true,
    });
    const yellowMat = new THREE.MeshStandardMaterial({
      color: 0xffca3a,
      roughness: 0.54,
      flatShading: true,
    });
    const bannerMat = new THREE.MeshStandardMaterial({
      map: makeStartBannerTexture(),
      roughness: 0.5,
      side: THREE.DoubleSide,
      flatShading: true,
    });
    const backBannerMat = new THREE.MeshStandardMaterial({
      map: makeSignTexture('GO KART', '#101820', '#ffca3a'),
      roughness: 0.58,
      side: THREE.DoubleSide,
      flatShading: true,
    });
    const redLightMat = new THREE.MeshStandardMaterial({
      color: 0xff3030,
      emissive: 0xb51111,
      emissiveIntensity: 0.85,
      roughness: 0.35,
      flatShading: true,
    });
    const amberLightMat = new THREE.MeshStandardMaterial({
      color: 0xffca3a,
      emissive: 0xc77908,
      emissiveIntensity: 0.75,
      roughness: 0.35,
      flatShading: true,
    });
    const greenLightMat = new THREE.MeshStandardMaterial({
      color: 0x32d957,
      emissive: 0x12872c,
      emissiveIntensity: 0.75,
      roughness: 0.35,
      flatShading: true,
    });

    const postGeo = new THREE.BoxGeometry(0.75, 8.8, 0.75);
    const towerGeo = new THREE.BoxGeometry(1.25, 1.9, 1.25);
    const topGeo = new THREE.BoxGeometry(this.width + 10, 0.78, 1);
    const bannerGeo = new THREE.PlaneGeometry(this.width, 3.25);
    const trussGeo = new THREE.BoxGeometry(this.width + 7, 0.32, 0.32);

    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, darkMat);
      post.position.set(side * (this.halfWidth + 2.8), 4.4, -0.2);
      const sleeve = new THREE.Mesh(towerGeo, yellowMat);
      sleeve.position.set(side * (this.halfWidth + 2.8), 7.65, -0.2);
      group.add(post, sleeve);
    }

    const top = new THREE.Mesh(topGeo, darkMat);
    top.position.set(0, 8.72, -0.2);
    group.add(top);

    for (let i = 0; i < 3; i += 1) {
      const truss = new THREE.Mesh(trussGeo, i % 2 === 0 ? yellowMat : darkMat);
      truss.position.set(0, 5.25 + i * 0.62, -0.35);
      group.add(truss);
    }

    const playerFace = new THREE.Mesh(bannerGeo, bannerMat);
    playerFace.name = 'START_Banner_Player_Face';
    playerFace.position.set(0, 7.05, -0.86);
    playerFace.rotation.y = Math.PI;
    group.add(playerFace);

    const reverseFace = new THREE.Mesh(bannerGeo, backBannerMat);
    reverseFace.position.set(0, 7.05, 0.48);
    group.add(reverseFace);

    const lightMats = [redLightMat, amberLightMat, greenLightMat];
    for (let i = 0; i < 3; i += 1) {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.95, 0.38), darkMat);
      pod.position.set(-1.75 + i * 1.75, 4.45, -1.04);
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.37, 10, 7), lightMats[i]);
      light.position.set(-1.75 + i * 1.75, 4.45, -1.27);
      group.add(pod, light);
    }

    setShadow(group);
    this.scene.add(group);

    const startGroundMat = new THREE.MeshStandardMaterial({
      map: makeStartBannerTexture(),
      roughness: 0.7,
      side: THREE.DoubleSide,
      flatShading: true,
    });
    const groundFrame = this.getFrameAtProgress(this.gridProgress + 8 / this.totalLength);
    const groundSign = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.7), startGroundMat);
    groundSign.position.copy(groundFrame.point).addScaledVector(groundFrame.tangent, 1.5);
    groundSign.position.y = 0.13;
    groundSign.rotation.x = -Math.PI / 2;
    groundSign.rotation.z = -yawFromDirection(groundFrame.tangent);
    groundSign.receiveShadow = true;
    this.scene.add(groundSign);
  }

  createStartGridMarkers() {
    const markerGeo = new THREE.BoxGeometry(3.2, 0.04, 0.28);
    const markerMat = new THREE.MeshStandardMaterial({
      color: 0xf6f3dd,
      roughness: 0.8,
      flatShading: true,
    });

    for (let i = 0; i < 15; i += 1) {
      const pose = this.getStartGridPose(i);
      const front = new THREE.Mesh(markerGeo, markerMat);
      front.position.copy(pose.position).addScaledVector(pose.tangent, 2.4);
      front.position.y = 0.09;
      front.rotation.y = pose.yaw;
      front.receiveShadow = true;
      this.scene.add(front);
    }
  }

  getFrameAtProgress(progress) {
    const wrapped = wrap01(progress);
    const targetDistance = wrapped * this.totalLength;
    let index = 0;

    for (let i = 0; i < this.sampleCount; i += 1) {
      const nextIndex = (i + 1) % this.sampleCount;
      const start = this.samples[i].distance;
      const end =
        nextIndex === 0 ? this.totalLength : this.samples[nextIndex].distance;
      if (targetDistance >= start && targetDistance <= end) {
        index = i;
        break;
      }
    }

    const nextIndex = (index + 1) % this.sampleCount;
    const a = this.samples[index];
    const b = this.samples[nextIndex];
    const segmentLength = a.point.distanceTo(b.point);
    const segmentStart = a.distance;
    const t =
      segmentLength > 0
        ? clamp((targetDistance - segmentStart) / segmentLength, 0, 1)
        : 0;
    const point = a.point.clone().lerp(b.point, t);
    const tangent = b.point.clone().sub(a.point).setY(0).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

    return { point, tangent, normal, progress: wrapped, distance: targetDistance };
  }

  getNearestInfo(position) {
    let bestDistanceSq = Infinity;
    let best = null;

    for (let i = 0; i < this.sampleCount; i += 1) {
      const nextIndex = (i + 1) % this.sampleCount;
      const a = this.samples[i].point;
      const b = this.samples[nextIndex].point;
      const t = closestPointOnSegment2D(position, a, b, tmpPoint);
      const dx = position.x - tmpPoint.x;
      const dz = position.z - tmpPoint.z;
      const distanceSq = dx * dx + dz * dz;

      if (distanceSq < bestDistanceSq) {
        const tangent = tmpPointB.copy(b).sub(a).setY(0).normalize();
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
        const lateral = dx * normal.x + dz * normal.z;
        const startDistance = this.samples[i].distance;
        const segmentLength = a.distanceTo(b);
        const distance = startDistance + segmentLength * t;
        bestDistanceSq = distanceSq;
        best = {
          center: tmpPoint.clone(),
          tangent: tangent.clone(),
          normal,
          lateral,
          distanceFromCenter: Math.sqrt(distanceSq),
          progress: wrap01(distance / this.totalLength),
          segmentIndex: i,
        };
      }
    }

    return best;
  }

  progressSpan(startProgress, endProgress) {
    const start = wrap01(startProgress);
    const end = endProgress >= 1 ? endProgress : wrap01(endProgress);
    return end >= start ? end - start : end + 1 - start;
  }

  progressInRange(progress, startProgress, endProgress) {
    const p = wrap01(progress);
    const start = wrap01(startProgress);
    const end = endProgress >= 1 ? 1 : wrap01(endProgress);
    if (end >= start) return p >= start && p <= end;
    return p >= start || p <= end;
  }

  getBiomeAtProgress(progress) {
    return this.biomes.find((biome) => this.progressInRange(progress, biome.start, biome.end))
      ?? this.biomes[0];
  }

  getShortcutInfo(position, allowNearby = false) {
    let best = null;
    let bestScore = Infinity;
    const margin = allowNearby ? 8.5 : 0;

    for (const zone of this.shortcutZones) {
      this.prepareShortcutZone(zone);
      const t = closestPointOnSegment2D(
        position,
        zone.shortcutStart,
        zone.shortcutEnd,
        tmpPoint,
      );
      const dx = position.x - tmpPoint.x;
      const dz = position.z - tmpPoint.z;
      const lateral = dx * zone.shortcutNormal.x + dz * zone.shortcutNormal.z;
      const absLateral = Math.abs(lateral);
      if (absLateral > zone.shortcutHalfWidth + margin) continue;

      const span = this.progressSpan(zone.start, zone.end);
      const progress = wrap01(zone.start + span * t);
      const overshoot = Math.max(0, absLateral - zone.shortcutHalfWidth);
      const score = overshoot * overshoot + dx * dx + dz * dz * 0.18;
      if (score >= bestScore) continue;

      bestScore = score;
      best = {
        center: tmpPoint.clone(),
        tangent: zone.shortcutTangent.clone(),
        normal: zone.shortcutNormal.clone(),
        lateral,
        distanceFromCenter: Math.sqrt(dx * dx + dz * dz),
        progress,
        segmentIndex: -1,
        onShortcut: absLateral <= zone.shortcutHalfWidth,
        shortcutZone: zone,
        maxDriveableHalfWidth: zone.shortcutHalfWidth,
      };
    }

    return best;
  }

  getRaceInfo(position) {
    const shortcut = this.getShortcutInfo(position, false);
    return shortcut?.onShortcut ? shortcut : this.getNearestInfo(position);
  }

  getSurfaceInfo(position) {
    const mainInfo = this.getNearestInfo(position);
    const shortcutInfo = this.getShortcutInfo(position, true);
    const mainMax = this.driveableHalfWidth ?? this.halfWidth - 0.45;
    const mainInside = Math.abs(mainInfo.lateral) <= mainMax;
    let info = mainInfo;

    if (shortcutInfo) {
      const shortcutInside =
        Math.abs(shortcutInfo.lateral) <= shortcutInfo.maxDriveableHalfWidth;
      const mainOvershoot = Math.max(0, Math.abs(mainInfo.lateral) - mainMax);
      const shortcutOvershoot = Math.max(
        0,
        Math.abs(shortcutInfo.lateral) - shortcutInfo.maxDriveableHalfWidth,
      );
      if (shortcutInside || (!mainInside && shortcutOvershoot < mainOvershoot)) {
        info = shortcutInfo;
      }
    }

    const absLateral = Math.abs(info.lateral);
    const biome = this.getBiomeAtProgress(info.progress);
    const onShortcut = Boolean(info.onShortcut || info.shortcutZone);
    const onTrack = onShortcut || absLateral <= this.halfWidth;
    const onCurb =
      !onShortcut &&
      absLateral > this.halfWidth &&
      absLateral <= this.halfWidth + 1.25;
    const onRunoff =
      !onShortcut &&
      absLateral <= this.halfWidth + this.runoffWidth;

    let speedFactor = biome.speed;
    let gripFactor = biome.grip;
    let drag = biome.drag;
    if (onShortcut && info.shortcutZone) {
      speedFactor = info.shortcutZone.speed;
      gripFactor = info.shortcutZone.grip;
      drag = info.shortcutZone.drag;
    } else if (onCurb) {
      speedFactor = 0.94;
      gripFactor = 0.9;
      drag = 0.22;
    } else if (!onTrack && onRunoff) {
      speedFactor = 0.72;
      gripFactor = 0.68;
      drag = 0.7;
    } else if (!onTrack) {
      speedFactor = 0.58;
      gripFactor = 0.55;
      drag = 0.95;
    }

    return {
      ...info,
      biome,
      onTrack,
      onCurb,
      onRunoff,
      onShortcut,
      speedFactor,
      gripFactor,
      drag,
      maxDriveableHalfWidth: info.maxDriveableHalfWidth ?? mainMax,
    };
  }

  getFallHazard(position) {
    const info = this.getRaceInfo(position);
    if (info.onShortcut) return null;

    for (const hazard of this.jumpHazards) {
      if (!this.progressInRange(info.progress, hazard.start, hazard.end)) continue;
      if (Math.abs(info.lateral) <= hazard.halfWidth) {
        return { ...hazard, info };
      }
    }
    return null;
  }

  getCurvatureAhead(progress) {
    const a = this.getFrameAtProgress(progress).tangent;
    const b = this.getFrameAtProgress(progress + 18 / this.totalLength).tangent;
    const c = this.getFrameAtProgress(progress + 42 / this.totalLength).tangent;
    const dotAB = clamp(a.dot(b), -1, 1);
    const dotBC = clamp(b.dot(c), -1, 1);
    return clamp((Math.acos(dotAB) + Math.acos(dotBC)) / 1.7, 0, 1);
  }

  getStartGridPose(index) {
    const row = Math.floor(index / 2);
    const side = index % 2 === 0 ? -1 : 1;
    const progress = this.gridProgress - row * (8.4 / this.totalLength);
    const frame = this.getFrameAtProgress(progress);
    const lateral = side * 4;
    const position = frame.point.clone().addScaledVector(frame.normal, lateral);
    position.y = 0.18;
    return {
      position,
      yaw: yawFromDirection(frame.tangent),
      tangent: frame.tangent,
      normal: frame.normal,
      progress,
    };
  }

  getResetPose(position) {
    const nearest = this.getNearestInfo(position);
    const frame = this.getFrameAtProgress(nearest.progress + 6 / this.totalLength);
    const resetPosition = frame.point.clone();
    resetPosition.y = 0.18;
    return {
      position: resetPosition,
      yaw: yawFromDirection(frame.tangent),
    };
  }
}
