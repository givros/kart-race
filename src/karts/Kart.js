import * as THREE from 'three';
import { clamp, forwardFromYaw } from '../utils/math.js';
import { createKenneyModel, KENNEY_ASSETS } from '../assets/KenneyAssets.js';

const UNIT_Y = new THREE.Vector3(0, 1, 0);

function shadowize(group) {
  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

function createRoundedBoxGeometry(width, height, depth, radius = 0.08) {
  const r = Math.min(radius, width * 0.45, height * 0.45);
  const x = width / 2;
  const y = height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-x + r, -y);
  shape.lineTo(x - r, -y);
  shape.quadraticCurveTo(x, -y, x, -y + r);
  shape.lineTo(x, y - r);
  shape.quadraticCurveTo(x, y, x - r, y);
  shape.lineTo(-x + r, y);
  shape.quadraticCurveTo(-x, y, -x, y - r);
  shape.lineTo(-x, -y + r);
  shape.quadraticCurveTo(-x, -y, -x + r, -y);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: r * 0.38,
    bevelThickness: r * 0.32,
    bevelSegments: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function createTaperedBoxGeometry(bottomWidth, topWidth, height, depth) {
  const bw = bottomWidth / 2;
  const tw = topWidth / 2;
  const h = height / 2;
  const d = depth / 2;
  const positions = [
    -bw, -h, -d, bw, -h, -d, tw, h, -d, -tw, h, -d,
    -bw, -h, d, bw, -h, d, tw, h, d, -tw, h, d,
  ];
  const indices = [
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1,
    3, 2, 6, 3, 6, 7,
    1, 5, 6, 1, 6, 2,
    0, 3, 7, 0, 7, 4,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createNumberTexture(number, bg, fg, stripe) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 14;
  ctx.strokeRect(15, 15, 226, 226);
  ctx.fillStyle = stripe;
  ctx.beginPath();
  ctx.moveTo(24, 208);
  ctx.lineTo(208, 24);
  ctx.lineTo(232, 48);
  ctx.lineTo(48, 232);
  ctx.closePath();
  ctx.fill();
  ctx.font = '900 142px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fg;
  ctx.fillText(String(number), 128, 137);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createStripeTexture(primary, secondary, trim) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = secondary;
  ctx.beginPath();
  ctx.moveTo(0, 94);
  ctx.lineTo(512, 18);
  ctx.lineTo(512, 52);
  ctx.lineTo(0, 126);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = trim;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(0, 78);
  ctx.lineTo(512, 2);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function colorToCss(color) {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function addTube(group, start, end, radius, material, segments = 12) {
  const direction = end.clone().sub(start);
  const length = direction.length();
  if (length <= 0.0001) return null;
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, segments),
    material,
  );
  mesh.position.copy(start).lerp(end, 0.5);
  mesh.quaternion.setFromUnitVectors(UNIT_Y, direction.normalize());
  group.add(mesh);
  return mesh;
}

export class Kart {
  constructor(id, options = {}) {
    this.id = id;
    this.name = options.name ?? id;
    this.color = options.color ?? 0x2d6cdf;
    this.accent = options.accent ?? 0xffffff;
    this.isPlayer = options.isPlayer ?? false;
    this.aiIndex = options.aiIndex ?? 0;

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.steeringAngle = 0;
    this.currentSpeed = 0;
    this.collisionRadius = 2.15;
    this.collisionImpulse = 0;
    this.distanceDriven = 0;

    this.maxSpeed = options.maxSpeed ?? 42;
    this.accelerationForce = options.accelerationForce ?? 30;
    this.brakeForce = options.brakeForce ?? 46;
    this.reverseForce = options.reverseForce ?? 15;
    this.grip = options.grip ?? 7.6;
    this.driftValue = 0;
    this.driftCharge = 0;
    this.driftDirection = 0;
    this.wasDrifting = false;
    this.boostTimer = 0;
    this.boostPower = options.boostPower ?? 18;
    this.coinCount = 0;
    this.heldItem = null;
    this.pendingItem = null;
    this.itemRouletteTimer = 0;
    this.itemUseCooldown = 0;
    this.aiItemDelay = 0;
    this.invincibleTimer = 0;
    this.stunTimer = 0;
    this.slowTimer = 0;
    this.visualScale = 1;
    this.slipstreamCharge = 0;
    this.jumpTimer = 0;
    this.jumpDuration = 0;

    this.mesh = this.createMesh();
  }

  createMesh() {
    const group = new THREE.Group();
    group.name = `Kart_${this.id}`;
    this.rebuildMeshParts(group);

    shadowize(group);
    return group;
  }

  rebuildMeshParts(group = this.mesh) {
    this.frontWheels = [];
    this.wheels = [];
    this.driftSparks = [];
    this.steeringWheel = null;
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }

    const materials = this.createMaterials();
    this.createHeroKartMesh(group, materials);
    shadowize(group);
  }

  setLivery(color, accent) {
    const nextColor = Number(color ?? this.color);
    const nextAccent = Number(accent ?? this.accent);
    if (this.color === nextColor && this.accent === nextAccent) return;
    this.color = nextColor;
    this.accent = nextAccent;
    this.rebuildMeshParts();
    this.syncMesh(0);
  }

  createMaterials() {
    const bodyColor = colorToCss(this.color);
    const accentColor = colorToCss(this.accent);
    const numberTexture = createNumberTexture(
      this.isPlayer ? '8' : this.aiIndex,
      this.isPlayer ? '#fff2ad' : '#f7f7ef',
      '#111820',
      this.isPlayer ? '#f0c12b' : bodyColor,
    );
    const stripeTexture = createStripeTexture(
      bodyColor,
      accentColor,
      this.isPlayer ? '#ffffff' : '#f7f7ef',
    );

    const materials = {
      body: new THREE.MeshStandardMaterial({
        color: this.color,
        roughness: 0.43,
        metalness: 0.08,
      }),
      accent: new THREE.MeshStandardMaterial({
        color: this.accent,
        roughness: 0.5,
        metalness: 0.08,
      }),
      black: new THREE.MeshStandardMaterial({
        color: 0x101317,
        roughness: 0.78,
      }),
      rubber: new THREE.MeshStandardMaterial({
        color: 0x0e0e0e,
        roughness: 0.91,
      }),
      rim: new THREE.MeshStandardMaterial({
        color: 0xb8c4cc,
        roughness: 0.36,
        metalness: 0.5,
      }),
      tube: new THREE.MeshStandardMaterial({
        color: this.accent,
        roughness: 0.38,
        metalness: 0.42,
      }),
      metal: new THREE.MeshStandardMaterial({
        color: 0x757f87,
        roughness: 0.32,
        metalness: 0.65,
      }),
      seat: new THREE.MeshStandardMaterial({
        color: 0x17191c,
        roughness: 0.67,
      }),
      suit: new THREE.MeshStandardMaterial({
        color: 0x161b22,
        roughness: 0.58,
      }),
      skin: new THREE.MeshStandardMaterial({
        color: 0xc98b58,
        roughness: 0.75,
      }),
      helmet: new THREE.MeshStandardMaterial({
        color: this.isPlayer ? 0xf6f7ef : this.accent,
        roughness: 0.38,
        metalness: 0.05,
      }),
      visor: new THREE.MeshStandardMaterial({
        color: 0x0b1118,
        roughness: 0.22,
        metalness: 0.22,
      }),
      number: new THREE.MeshStandardMaterial({
        map: numberTexture,
        roughness: 0.46,
        side: THREE.DoubleSide,
      }),
      stripe: new THREE.MeshStandardMaterial({
        map: stripeTexture,
        roughness: 0.42,
        side: THREE.DoubleSide,
      }),
      fuel: new THREE.MeshStandardMaterial({
        color: 0xf2eee2,
        roughness: 0.35,
        transparent: true,
        opacity: 0.72,
      }),
      spark: new THREE.MeshBasicMaterial({ color: 0x54c7ff }),
    };

    for (const material of Object.values(materials)) {
      if ('flatShading' in material) {
        material.flatShading = true;
        material.needsUpdate = true;
      }
    }

    return materials;
  }

  makeRoundedBox(width, height, depth, material, radius = 0.08) {
    return new THREE.Mesh(
      createRoundedBoxGeometry(width, height, depth, radius),
      material,
    );
  }

  createHeroKartMesh(group, materials) {
    this.addKenneyKartBody(group);
    this.addCompactDriver(group, materials);

    const engine = new THREE.Group();
    engine.position.set(0, -0.02, 0.02);
    engine.scale.setScalar(0.58);
    group.add(engine);
    this.addHeroEngine(engine, materials);

    this.addKenneyNumberPlates(group, materials);
    this.addDriftSparks(group, materials);
  }

  addKenneyKartBody(group) {
    const model = createKenneyModel(KENNEY_ASSETS.car.race, {
      name: `KenneyKart_${this.id}`,
      fitLength: 5.35,
      tint: this.color,
      solidTint: true,
      solidTintDarkCutoff: 0.18,
      tintStrength: this.isPlayer ? 0.88 : 0.8,
      lightTintStrength: this.isPlayer ? 0.92 : 0.72,
      neutralTintStrength: this.isPlayer ? 0.32 : 0.24,
      darkTintStrength: 0.01,
      localOffset: new THREE.Vector3(0, 0.12, -0.05),
    });
    group.add(model);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(2.35, 18),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, 0.03, -0.08);
    group.add(shadow);
  }

  addCompactDriver(group, materials) {
    const seatBack = this.makeRoundedBox(0.62, 0.48, 0.18, materials.seat, 0.08);
    seatBack.position.set(0, 0.78, -0.18);
    seatBack.rotation.x = -0.2;
    group.add(seatBack);

    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.31, 0.48, 8),
      materials.suit,
    );
    torso.position.set(0, 1.08, -0.03);
    torso.rotation.x = -0.14;
    group.add(torso);

    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.23, 12, 8),
      materials.helmet,
    );
    helmet.position.set(0, 1.43, 0.06);
    helmet.scale.set(1, 0.92, 1.04);
    group.add(helmet);

    const visor = this.makeRoundedBox(0.42, 0.13, 0.04, materials.visor, 0.035);
    visor.position.set(0, 1.44, 0.29);
    visor.rotation.x = -0.08;
    group.add(visor);

    for (const side of [-1, 1]) {
      addTube(group, new THREE.Vector3(side * 0.13, 1.05, 0.08), new THREE.Vector3(side * 0.3, 0.88, 0.43), 0.035, materials.suit, 8);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), materials.skin);
      hand.position.set(side * 0.25, 0.88, 0.45);
      group.add(hand);
    }

    const steeringPost = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.032, 0.48, 8),
      materials.metal,
    );
    steeringPost.position.set(0, 0.68, 0.42);
    steeringPost.rotation.x = Math.PI * 0.34;
    group.add(steeringPost);

    this.steeringWheel = new THREE.Mesh(
      new THREE.TorusGeometry(0.2, 0.024, 6, 14),
      materials.black,
    );
    this.steeringWheel.position.set(0, 0.86, 0.54);
    this.steeringWheel.rotation.x = Math.PI * 0.62;
    group.add(this.steeringWheel);
  }

  addKenneyNumberPlates(group, materials) {
    const frontPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.38), materials.number);
    frontPlate.position.set(0, 0.62, 2.46);
    frontPlate.rotation.x = -0.08;
    group.add(frontPlate);
  }

  addHeroFrame(group, materials) {
    const y = 0.38;
    const leftFront = new THREE.Vector3(-0.74, y, 1.74);
    const rightFront = new THREE.Vector3(0.74, y, 1.74);
    const leftMid = new THREE.Vector3(-0.96, y, 0.0);
    const rightMid = new THREE.Vector3(0.96, y, 0.0);
    const leftRear = new THREE.Vector3(-0.86, y, -1.68);
    const rightRear = new THREE.Vector3(0.86, y, -1.68);

    addTube(group, leftFront, leftMid, 0.055, materials.tube);
    addTube(group, leftMid, leftRear, 0.055, materials.tube);
    addTube(group, rightFront, rightMid, 0.055, materials.tube);
    addTube(group, rightMid, rightRear, 0.055, materials.tube);
    addTube(group, leftFront, rightFront, 0.05, materials.tube);
    addTube(group, leftMid, rightMid, 0.05, materials.tube);
    addTube(group, leftRear, rightRear, 0.06, materials.tube);
    addTube(group, new THREE.Vector3(-0.78, y, 1.45), new THREE.Vector3(0.78, y, -1.25), 0.038, materials.tube);
    addTube(group, new THREE.Vector3(0.78, y, 1.45), new THREE.Vector3(-0.78, y, -1.25), 0.038, materials.tube);
    addTube(group, new THREE.Vector3(-1.35, 0.42, 2.05), new THREE.Vector3(1.35, 0.42, 2.05), 0.045, materials.metal);
    addTube(group, new THREE.Vector3(-1.08, 0.4, 1.7), new THREE.Vector3(-1.7, 0.4, 0.7), 0.04, materials.tube);
    addTube(group, new THREE.Vector3(1.08, 0.4, 1.7), new THREE.Vector3(1.7, 0.4, 0.7), 0.04, materials.tube);

    const floor = this.makeRoundedBox(1.82, 0.08, 2.62, materials.black, 0.05);
    floor.position.set(0, 0.36, -0.12);
    group.add(floor);

    const skidPlate = this.makeRoundedBox(1.26, 0.045, 1.85, materials.metal, 0.04);
    skidPlate.position.set(0, 0.315, 0.04);
    group.add(skidPlate);

    const rearAxle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.065, 3.35, 16),
      materials.metal,
    );
    rearAxle.rotation.z = Math.PI / 2;
    rearAxle.position.set(0, 0.47, -1.42);
    group.add(rearAxle);

    const brakeDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.035, 24),
      materials.metal,
    );
    brakeDisc.rotation.z = Math.PI / 2;
    brakeDisc.position.set(-0.96, 0.47, -1.42);
    group.add(brakeDisc);

    const sprocket = new THREE.Mesh(
      new THREE.TorusGeometry(0.31, 0.035, 6, 16),
      materials.metal,
    );
    sprocket.rotation.y = Math.PI / 2;
    sprocket.position.set(0.98, 0.47, -1.42);
    group.add(sprocket);
  }

  addHeroBodywork(group, materials) {
    const frontSpoiler = this.makeRoundedBox(4.05, 0.32, 0.78, materials.body, 0.2);
    frontSpoiler.position.set(0, 0.43, 2.3);
    group.add(frontSpoiler);

    const lowerLip = this.makeRoundedBox(4.22, 0.16, 0.36, materials.black, 0.11);
    lowerLip.position.set(0, 0.28, 2.55);
    group.add(lowerLip);

    const frontIntake = this.makeRoundedBox(1.25, 0.16, 0.08, materials.black, 0.04);
    frontIntake.position.set(0, 0.48, 2.94);
    group.add(frontIntake);

    for (const side of [-1, 1]) {
      const bumperEnd = this.makeRoundedBox(0.42, 0.42, 0.82, materials.accent, 0.14);
      bumperEnd.position.set(side * 1.93, 0.43, 2.32);
      bumperEnd.rotation.y = side * 0.18;
      group.add(bumperEnd);
    }

    const frontNumber = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, 0.42),
      materials.number,
    );
    frontNumber.position.set(0, 0.53, 2.93);
    group.add(frontNumber);

    const nose = this.makeRoundedBox(1.08, 0.28, 2.16, materials.body, 0.14);
    nose.position.set(0, 0.62, 1.15);
    nose.rotation.x = -0.04;
    group.add(nose);

    const noseStripe = this.makeRoundedBox(0.46, 0.04, 1.85, materials.accent, 0.03);
    noseStripe.position.set(0, 0.78, 1.2);
    noseStripe.rotation.x = -0.04;
    group.add(noseStripe);

    const noseSideShade = this.makeRoundedBox(1.18, 0.065, 1.42, materials.black, 0.04);
    noseSideShade.position.set(0, 0.5, 0.96);
    noseSideShade.rotation.x = -0.04;
    group.add(noseSideShade);

    const nassau = new THREE.Mesh(
      createTaperedBoxGeometry(0.96, 0.54, 1.15, 1.45),
      materials.body,
    );
    nassau.position.set(0, 1.06, 0.92);
    nassau.rotation.x = -0.19;
    group.add(nassau);

    const nassauNumber = new THREE.Mesh(
      new THREE.PlaneGeometry(0.54, 0.72),
      materials.number,
    );
    nassauNumber.position.set(0, 1.18, 1.56);
    nassauNumber.rotation.x = -0.2;
    group.add(nassauNumber);

    const frontFairingCaps = [
      [-1.58, 0.52, 1.72, -0.18],
      [1.58, 0.52, 1.72, 0.18],
    ];
    for (const [x, y, z, rot] of frontFairingCaps) {
      const cap = this.makeRoundedBox(0.78, 0.24, 1.02, materials.body, 0.16);
      cap.position.set(x, y, z);
      cap.rotation.y = rot;
      group.add(cap);
    }

    for (const side of [-1, 1]) {
      const pod = this.makeRoundedBox(0.78, 0.5, 2.52, materials.body, 0.18);
      pod.position.set(side * 1.58, 0.5, -0.03);
      pod.rotation.z = side * -0.035;
      group.add(pod);

      const podLip = this.makeRoundedBox(0.84, 0.18, 2.36, materials.black, 0.09);
      podLip.position.set(side * 1.6, 0.31, -0.06);
      group.add(podLip);

      const podTopBlade = this.makeRoundedBox(0.28, 0.08, 2.12, materials.accent, 0.05);
      podTopBlade.position.set(side * 1.57, 0.8, -0.02);
      podTopBlade.rotation.z = side * -0.035;
      group.add(podTopBlade);

      const podNoseCap = this.makeRoundedBox(0.86, 0.34, 0.24, materials.accent, 0.08);
      podNoseCap.position.set(side * 1.58, 0.52, 1.26);
      group.add(podNoseCap);

      const rearPodCap = this.makeRoundedBox(0.88, 0.36, 0.32, materials.black, 0.08);
      rearPodCap.position.set(side * 1.58, 0.48, -1.38);
      group.add(rearPodCap);

      const decal = new THREE.Mesh(
        new THREE.PlaneGeometry(1.42, 0.38),
        materials.stripe,
      );
      decal.position.set(side * 2.0, 0.6, 0.1);
      decal.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(decal);

      const sideNumber = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.5),
        materials.number,
      );
      sideNumber.position.set(side * 2.01, 0.64, -0.86);
      sideNumber.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(sideNumber);

      addTube(
        group,
        new THREE.Vector3(side * 1.0, 0.48, 1.1),
        new THREE.Vector3(side * 1.82, 0.46, 1.28),
        0.038,
        materials.metal,
      );
      addTube(
        group,
        new THREE.Vector3(side * 0.98, 0.46, -0.9),
        new THREE.Vector3(side * 1.82, 0.46, -1.03),
        0.038,
        materials.metal,
      );
    }

    const rearBumper = this.makeRoundedBox(3.42, 0.28, 0.34, materials.black, 0.13);
    rearBumper.position.set(0, 0.52, -2.08);
    group.add(rearBumper);

    const rearCrashBar = this.makeRoundedBox(2.62, 0.18, 0.22, materials.accent, 0.08);
    rearCrashBar.position.set(0, 0.8, -2.0);
    group.add(rearCrashBar);

    for (const side of [-1, 1]) {
      const rearCorner = this.makeRoundedBox(0.58, 0.22, 0.68, materials.body, 0.14);
      rearCorner.position.set(side * 1.18, 0.54, -1.86);
      rearCorner.rotation.y = side * 0.18;
      group.add(rearCorner);

      addTube(
        group,
        new THREE.Vector3(side * 1.15, 0.58, -1.76),
        new THREE.Vector3(side * 1.78, 0.54, -2.08),
        0.048,
        materials.metal,
      );
    }
  }

  addHeroCockpit(group, materials) {
    const seatBase = this.makeRoundedBox(1.04, 0.26, 0.92, materials.seat, 0.12);
    seatBase.position.set(0, 0.78, -0.48);
    seatBase.rotation.x = -0.1;
    group.add(seatBase);

    const seatBack = this.makeRoundedBox(1.08, 1.1, 0.22, materials.seat, 0.12);
    seatBack.position.set(0, 1.25, -0.85);
    seatBack.rotation.x = -0.28;
    group.add(seatBack);

    for (const side of [-1, 1]) {
      const bolster = this.makeRoundedBox(0.18, 0.76, 0.88, materials.seat, 0.08);
      bolster.position.set(side * 0.55, 1.05, -0.5);
      bolster.rotation.z = side * 0.08;
      group.add(bolster);
    }

    const fuelTank = this.makeRoundedBox(0.68, 0.42, 0.78, materials.fuel, 0.13);
    fuelTank.position.set(0, 0.78, 0.32);
    group.add(fuelTank);

    const tankCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.08, 8),
      materials.black,
    );
    tankCap.position.set(0, 1.04, 0.32);
    group.add(tankCap);

    const pedalPlate = this.makeRoundedBox(1.08, 0.07, 0.5, materials.metal, 0.04);
    pedalPlate.position.set(0, 0.5, 1.14);
    pedalPlate.rotation.x = -0.18;
    group.add(pedalPlate);

    for (const side of [-1, 1]) {
      const pedal = this.makeRoundedBox(0.18, 0.045, 0.44, materials.black, 0.03);
      pedal.position.set(side * 0.28, 0.59, 1.36);
      pedal.rotation.x = -0.5;
      pedal.rotation.z = side * 0.12;
      group.add(pedal);
    }

    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.43, 0.78, 8),
      materials.suit,
    );
    torso.position.set(0, 1.42, -0.42);
    torso.rotation.x = -0.16;
    group.add(torso);

    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.16, 0.16, 8),
      materials.skin,
    );
    neck.position.set(0, 1.86, -0.28);
    group.add(neck);

    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.38, 12, 8),
      materials.helmet,
    );
    helmet.position.set(0, 2.15, -0.22);
    helmet.scale.set(1, 0.94, 1.08);
    group.add(helmet);

    const visor = this.makeRoundedBox(0.56, 0.19, 0.045, materials.visor, 0.04);
    visor.position.set(0, 2.16, 0.15);
    visor.rotation.x = -0.1;
    group.add(visor);

    const visorBrow = this.makeRoundedBox(0.62, 0.075, 0.055, materials.accent, 0.025);
    visorBrow.position.set(0, 2.27, 0.13);
    visorBrow.rotation.x = -0.12;
    group.add(visorBrow);

    const helmetStripe = this.makeRoundedBox(0.16, 0.06, 0.58, materials.accent, 0.03);
    helmetStripe.position.set(0, 2.48, -0.12);
    helmetStripe.rotation.x = -0.18;
    group.add(helmetStripe);

    addTube(group, new THREE.Vector3(-0.22, 1.55, -0.12), new THREE.Vector3(-0.42, 1.22, 0.55), 0.055, materials.suit);
    addTube(group, new THREE.Vector3(0.22, 1.55, -0.12), new THREE.Vector3(0.42, 1.22, 0.55), 0.055, materials.suit);
    addTube(group, new THREE.Vector3(-0.42, 1.22, 0.55), new THREE.Vector3(-0.28, 1.2, 0.88), 0.045, materials.skin);
    addTube(group, new THREE.Vector3(0.42, 1.22, 0.55), new THREE.Vector3(0.28, 1.2, 0.88), 0.045, materials.skin);

    for (const side of [-1, 1]) {
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), materials.skin);
      hand.position.set(side * 0.28, 1.2, 0.91);
      hand.scale.set(1, 0.74, 1);
      group.add(hand);
    }

    const steeringPost = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.82, 10),
      materials.metal,
    );
    steeringPost.position.set(0, 0.98, 0.78);
    steeringPost.rotation.x = Math.PI * 0.34;
    group.add(steeringPost);

    this.steeringWheel = new THREE.Mesh(
      new THREE.TorusGeometry(0.33, 0.032, 6, 16),
      materials.black,
    );
    this.steeringWheel.position.set(0, 1.25, 1.04);
    this.steeringWheel.rotation.x = Math.PI * 0.62;
    group.add(this.steeringWheel);

    addTube(group, new THREE.Vector3(-0.22, 1.24, 1.02), new THREE.Vector3(0.22, 1.24, 1.02), 0.025, materials.metal, 8);
    addTube(group, new THREE.Vector3(0, 1.25, 1.04), new THREE.Vector3(0, 1.43, 1.1), 0.021, materials.metal, 8);
    addTube(group, new THREE.Vector3(0, 1.25, 1.04), new THREE.Vector3(0, 1.08, 1.0), 0.021, materials.metal, 8);
    const steeringHub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.05, 8),
      materials.metal,
    );
    steeringHub.position.set(0, 1.25, 1.04);
    steeringHub.rotation.x = Math.PI * 0.62;
    group.add(steeringHub);
  }

  addHeroEngine(group, materials) {
    const engineMount = this.makeRoundedBox(1.05, 0.08, 1.02, materials.metal, 0.04);
    engineMount.position.set(0.98, 0.57, -1.28);
    group.add(engineMount);

    const engineBlock = this.makeRoundedBox(0.78, 0.56, 0.82, materials.black, 0.08);
    engineBlock.position.set(0.96, 0.86, -1.28);
    group.add(engineBlock);

    for (let i = 0; i < 5; i += 1) {
      const fin = this.makeRoundedBox(0.86, 0.035, 0.62, materials.metal, 0.03);
      fin.position.set(0.96, 1.12 + i * 0.07, -1.28);
      group.add(fin);
    }

    const cylinderHead = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.28, 0.5, 8),
      materials.metal,
    );
    cylinderHead.rotation.z = Math.PI / 2;
    cylinderHead.position.set(1.2, 1.04, -1.06);
    group.add(cylinderHead);

    const airFilter = new THREE.Mesh(
      new THREE.CylinderGeometry(0.23, 0.23, 0.34, 8),
      materials.accent,
    );
    airFilter.rotation.z = Math.PI / 2;
    airFilter.position.set(0.58, 1.06, -1.08);
    group.add(airFilter);

    const pullStarter = new THREE.Mesh(
      new THREE.TorusGeometry(0.18, 0.025, 6, 12),
      materials.metal,
    );
    pullStarter.rotation.y = Math.PI / 2;
    pullStarter.position.set(0.54, 0.86, -1.42);
    group.add(pullStarter);

    addTube(group, new THREE.Vector3(1.22, 0.92, -1.52), new THREE.Vector3(1.58, 0.8, -1.75), 0.06, materials.metal, 12);
    const exhaust = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.2, 1.08, 8),
      materials.metal,
    );
    exhaust.rotation.z = Math.PI / 2;
    exhaust.position.set(1.72, 0.78, -1.84);
    group.add(exhaust);

    const exhaustBand = this.makeRoundedBox(0.06, 0.32, 0.18, materials.black, 0.02);
    exhaustBand.position.set(1.72, 0.78, -1.84);
    group.add(exhaustBand);

    const exhaustTip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.08, 8),
      materials.black,
    );
    exhaustTip.rotation.z = Math.PI / 2;
    exhaustTip.position.set(2.27, 0.78, -1.84);
    group.add(exhaustTip);

    const chain = new THREE.Mesh(
      new THREE.TorusGeometry(0.33, 0.026, 6, 16),
      materials.black,
    );
    chain.rotation.y = Math.PI / 2;
    chain.position.set(0.96, 0.62, -1.42);
    group.add(chain);
  }

  addHeroWheels(group, materials) {
    const wheelPositions = [
      [-1.62, 0.45, 1.16, true],
      [1.62, 0.45, 1.16, true],
      [-1.62, 0.45, -1.42, false],
      [1.62, 0.45, -1.42, false],
    ];

    for (const [x, y, z, front] of wheelPositions) {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      const wheel = this.createWheel(0.48, 0.44, materials);
      pivot.add(wheel);
      group.add(pivot);
      this.wheels.push(wheel);
      if (front) this.frontWheels.push(pivot);
    }

    for (const side of [-1, 1]) {
      addTube(group, new THREE.Vector3(side * 0.26, 0.58, 0.92), new THREE.Vector3(side * 1.42, 0.52, 1.16), 0.028, materials.metal, 8);
      addTube(group, new THREE.Vector3(side * 0.62, 0.42, 1.38), new THREE.Vector3(side * 1.36, 0.44, 1.16), 0.04, materials.tube, 10);
      const spindle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.055, 0.42, 12),
        materials.metal,
      );
      spindle.rotation.z = Math.PI / 2;
      spindle.position.set(side * 1.38, 0.45, 1.16);
      group.add(spindle);
    }
  }

  createWheel(radius, width, materials) {
    const spinGroup = new THREE.Group();
    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, width, 16),
      materials.rubber,
    );
    tire.rotation.z = Math.PI / 2;
    spinGroup.add(tire);

    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.54, radius * 0.54, width + 0.025, 12),
      materials.rim,
    );
    rim.rotation.z = Math.PI / 2;
    spinGroup.add(rim);

    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.2, radius * 0.25, width + 0.055, 10),
      materials.black,
    );
    hub.rotation.z = Math.PI / 2;
    spinGroup.add(hub);

    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      const tread = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.08, 0.045, 0.16),
        materials.black,
      );
      tread.position.set(
        0,
        Math.sin(angle) * radius * 0.98,
        Math.cos(angle) * radius * 0.98,
      );
      tread.rotation.x = angle;
      spinGroup.add(tread);
    }

    for (const x of [-width * 0.53, width * 0.53]) {
      const sidewallStripe = new THREE.Mesh(
        new THREE.TorusGeometry(radius * 0.9, 0.012, 5, 16),
        materials.metal,
      );
      sidewallStripe.rotation.y = Math.PI / 2;
      sidewallStripe.position.x = x;
      spinGroup.add(sidewallStripe);
    }

    for (let i = 0; i < 5; i += 1) {
      const spoke = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.055, radius * 0.74),
        materials.rim,
      );
      spoke.position.x = width * 0.57;
      spoke.rotation.x = (i / 5) * Math.PI * 2;
      spinGroup.add(spoke);
    }

    return spinGroup;
  }

  createBasicKartMesh(group, materials) {
    const base = this.makeRoundedBox(2.35, 0.34, 3.55, materials.body, 0.08);
    base.position.y = 0.48;
    group.add(base);

    const nose = this.makeRoundedBox(1.65, 0.22, 1.05, materials.accent, 0.08);
    nose.position.set(0, 0.58, 1.65);
    group.add(nose);

    const frontBumper = this.makeRoundedBox(2.75, 0.22, 0.25, materials.black, 0.08);
    frontBumper.position.set(0, 0.42, 2.18);
    group.add(frontBumper);

    const rearBumper = this.makeRoundedBox(2.85, 0.28, 0.28, materials.black, 0.08);
    rearBumper.position.set(0, 0.48, -1.95);
    group.add(rearBumper);

    const sideRailGeo = new THREE.BoxGeometry(0.16, 0.18, 3.2);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(sideRailGeo, materials.black);
      rail.position.set(side * 1.33, 0.56, 0);
      group.add(rail);
    }

    const seat = this.makeRoundedBox(1.05, 0.95, 0.95, materials.seat, 0.1);
    seat.position.set(0, 0.97, -0.32);
    seat.rotation.x = -0.16;
    group.add(seat);

    const engine = this.makeRoundedBox(1.05, 0.62, 0.95, materials.black, 0.08);
    engine.position.set(0.88, 0.86, -1.35);
    group.add(engine);

    const exhaust = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.95, 12),
      materials.metal,
    );
    exhaust.rotation.z = Math.PI / 2;
    exhaust.position.set(1.44, 0.9, -1.58);
    group.add(exhaust);

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.44, 0.8, 12), materials.suit);
    torso.position.set(0, 1.45, -0.38);
    torso.rotation.x = -0.18;
    group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), materials.skin);
    head.position.set(0, 2.02, -0.2);
    group.add(head);

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.39, 10, 8), materials.helmet);
    helmet.position.set(0, 2.05, -0.2);
    helmet.scale.set(1, 0.92, 1.04);
    group.add(helmet);

    const steeringPost = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.72, 8),
      materials.black,
    );
    steeringPost.position.set(0, 1.16, 0.72);
    steeringPost.rotation.x = Math.PI * 0.38;
    group.add(steeringPost);

    this.steeringWheel = new THREE.Mesh(
      new THREE.TorusGeometry(0.32, 0.035, 6, 16),
      materials.black,
    );
    this.steeringWheel.position.set(0, 1.35, 0.95);
    this.steeringWheel.rotation.x = Math.PI * 0.62;
    group.add(this.steeringWheel);

    const wheelPositions = [
      [-1.28, 0.43, 1.18, true],
      [1.28, 0.43, 1.18, true],
      [-1.28, 0.43, -1.25, false],
      [1.28, 0.43, -1.25, false],
    ];
    for (const [x, y, z, front] of wheelPositions) {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      const wheel = this.createWheel(0.43, 0.42, materials);
      pivot.add(wheel);
      group.add(pivot);
      this.wheels.push(wheel);
      if (front) this.frontWheels.push(pivot);
    }

    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.38), materials.number);
    plate.position.set(0, 0.88, 2.27);
    group.add(plate);
    this.addDriftSparks(group, materials);
  }

  addDriftSparks(group, materials) {
    const positions = [
      [-1.28, 0.24, -1.92],
      [1.28, 0.24, -1.92],
      [-1.7, 0.22, -1.55],
      [1.7, 0.22, -1.55],
    ];

    for (const [x, y, z] of positions) {
      const spark = new THREE.Mesh(
        new THREE.TetrahedronGeometry(0.22, 0),
        materials.spark.clone(),
      );
      spark.position.set(x, y, z);
      spark.rotation.set(Math.random(), Math.random(), Math.random());
      spark.visible = false;
      group.add(spark);
      this.driftSparks.push(spark);
    }
  }

  resetToPose(position, yaw) {
    this.position.copy(position);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.steeringAngle = 0;
    this.currentSpeed = 0;
    this.collisionImpulse = 0;
    this.distanceDriven = 0;
    this.driftCharge = 0;
    this.driftDirection = 0;
    this.wasDrifting = false;
    this.boostTimer = 0;
    this.coinCount = 0;
    this.heldItem = null;
    this.pendingItem = null;
    this.itemRouletteTimer = 0;
    this.itemUseCooldown = 0;
    this.aiItemDelay = 0;
    this.invincibleTimer = 0;
    this.stunTimer = 0;
    this.slowTimer = 0;
    this.visualScale = 1;
    this.slipstreamCharge = 0;
    this.jumpTimer = 0;
    this.jumpDuration = 0;
    this.syncMesh(0);
  }

  getForwardVector(target = new THREE.Vector3()) {
    return forwardFromYaw(this.yaw, target);
  }

  syncMesh(dt) {
    this.mesh.position.copy(this.position);
    this.jumpTimer = 0;
    this.jumpDuration = 0;
    this.mesh.rotation.y = this.yaw;
    this.mesh.scale.setScalar(this.visualScale ?? 1);

    const steeringVisual = clamp(this.steeringAngle, -1, 1) * 0.48;
    for (const pivot of this.frontWheels) {
      pivot.rotation.y = steeringVisual;
    }

    const spin = this.currentSpeed * dt * 2.3;
    for (const wheel of this.wheels) {
      wheel.rotation.x += spin;
    }

    if (this.steeringWheel) {
      this.steeringWheel.rotation.z = -steeringVisual * 1.4;
    }

    const sparkActive = this.driftCharge > 0.22 || this.boostTimer > 0 || this.invincibleTimer > 0;
    for (let i = 0; i < this.driftSparks.length; i += 1) {
      const spark = this.driftSparks[i];
      spark.visible = sparkActive;
      if (!sparkActive) continue;
      const boostHot = this.boostTimer > 0 || this.invincibleTimer > 0;
      spark.material.color.setHex(
        this.invincibleTimer > 0 ? 0xfff36e : boostHot ? 0xffd33f : this.driftCharge > 1.2 ? 0xff7a35 : 0x4cc9ff,
      );
      const pulse = boostHot ? 1.35 : 0.75 + Math.sin(performance.now() * 0.018 + i) * 0.18;
      spark.scale.setScalar(pulse);
      spark.rotation.x += dt * (7 + i);
      spark.rotation.y += dt * (9 + i * 0.5);
    }
  }
}
