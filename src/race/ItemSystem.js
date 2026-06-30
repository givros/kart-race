import * as THREE from 'three';
import { clamp, makeSeededRandom, randomRange, yawFromDirection } from '../utils/math.js';

const tmpForward = new THREE.Vector3();
const tmpVector = new THREE.Vector3();
const tmpVectorB = new THREE.Vector3();

const ITEM_DEFS = {
  turbo: {
    type: 'turbo',
    label: 'Turbo Boost',
    short: 'BOOST',
    icon: 'BOOST',
    hint: 'ACTIVER',
    verb: 'BOOST',
    effect: 'Acceleration immediate',
    color: 0xff8a28,
    uses: 1,
  },
  tripleTurbo: {
    type: 'tripleTurbo',
    label: 'Triple Boost',
    short: '3x BOOST',
    icon: '3x BOOST',
    hint: 'ACTIVER',
    verb: 'BOOST x3',
    effect: 'Trois boosts courts',
    color: 0xffc533,
    uses: 3,
  },
  rocket: {
    type: 'rocket',
    label: 'Rocket Shot',
    short: 'ROCKET',
    icon: 'ROCKET',
    hint: 'TIRER',
    verb: 'ATTAQUE',
    effect: 'Projectile droit',
    color: 0x29b6ff,
    uses: 1,
  },
  seeker: {
    type: 'seeker',
    label: 'Homing Seeker',
    short: 'LOCK',
    icon: 'LOCK',
    hint: 'TIRER',
    verb: 'CIBLE',
    effect: 'Vise le kart devant',
    color: 0xff3d57,
    uses: 1,
  },
  skidMine: {
    type: 'skidMine',
    label: 'Skid Mine',
    short: 'MINE',
    icon: 'MINE',
    hint: 'POSER',
    verb: 'PIEGE',
    effect: 'Piege derriere toi',
    color: 0x6fe26f,
    uses: 1,
  },
  pulse: {
    type: 'pulse',
    label: 'Pulse Horn',
    short: 'HORN',
    icon: 'HORN',
    hint: 'SONNER',
    verb: 'DEFENSE',
    effect: 'Onde de choc proche',
    color: 0xffffff,
    uses: 1,
  },
  storm: {
    type: 'storm',
    label: 'Storm Field',
    short: 'STORM',
    icon: 'STORM',
    hint: 'DECLENCHER',
    verb: 'CHAOS',
    effect: 'Ralentit les rivaux',
    color: 0x8b69ff,
    uses: 1,
  },
  star: {
    type: 'star',
    label: 'Star Shield',
    short: 'STAR',
    icon: 'STAR',
    hint: 'ACTIVER',
    verb: 'SHIELD',
    effect: 'Invincible et rapide',
    color: 0xffef62,
    uses: 1,
  },
  leaderDrone: {
    type: 'leaderDrone',
    label: 'Leader Drone',
    short: 'DRONE',
    icon: 'DRONE',
    hint: 'LANCER',
    verb: 'CHASSE',
    effect: 'Fonce sur le leader',
    color: 0x3fd8ff,
    uses: 1,
  },
  coinBurst: {
    type: 'coinBurst',
    label: 'Coin Burst',
    short: 'COINS',
    icon: 'COINS',
    hint: 'ACTIVER',
    verb: 'COINS',
    effect: 'Pieces et mini boost',
    color: 0xffdd4d,
    uses: 1,
  },
};

function makeCanvasTexture(draw) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  draw(ctx, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeItemFaceTexture() {
  return makeCanvasTexture((ctx, width, height) => {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#47dfff');
    gradient.addColorStop(0.5, '#fff26f');
    gradient.addColorStop(1, '#ff5ccd');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 16;
    ctx.strokeRect(18, 18, width - 36, height - 36);
    ctx.fillStyle = '#16202a';
    ctx.font = '900 156px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', width / 2, height / 2 + 8);
  });
}

function makeBoostPadTexture() {
  return makeCanvasTexture((ctx, width, height) => {
    ctx.fillStyle = '#10263b';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#2ed6ff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i += 1) {
      const y = 48 + i * 58;
      ctx.beginPath();
      ctx.moveTo(54, y + 28);
      ctx.lineTo(124, y - 20);
      ctx.lineTo(124, y + 12);
      ctx.lineTo(202, y + 12);
      ctx.lineTo(202, y + 44);
      ctx.lineTo(124, y + 44);
      ctx.lineTo(124, y + 76);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(8, 20, 35, 0.28)';
    ctx.fillRect(0, 0, 18, height);
    ctx.fillRect(width - 18, 0, 18, height);
  });
}

function cloneItem(type) {
  const def = ITEM_DEFS[type] ?? ITEM_DEFS.turbo;
  return { ...def, uses: def.uses };
}

function distanceSq2D(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

export class ItemSystem {
  constructor(scene, track, options = {}) {
    this.scene = scene;
    this.track = track;
    this.enabled = options.enabled ?? true;
    this.populate = options.populate ?? this.enabled;
    this.populateItemBoxes = options.itemBoxes ?? this.populate;
    this.populateCoins = options.coins ?? this.populate;
    this.populateBoostPads = options.boostPads ?? false;
    this.populateTrickRamps = options.trickRamps ?? false;
    this.random = makeSeededRandom(9001);
    this.itemBoxes = [];
    this.coins = [];
    this.boostPads = [];
    this.trickRamps = [];
    this.projectiles = [];
    this.traps = [];
    this.effects = [];
    this.events = [];
    this.eventId = 0;

    this.materials = this.populate ? {
      itemBox: new THREE.MeshStandardMaterial({
        map: makeItemFaceTexture(),
        emissive: 0x2abfff,
        emissiveIntensity: 0.45,
        roughness: 0.38,
        transparent: true,
        opacity: 0.88,
        flatShading: true,
      }),
      itemWire: new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true }),
      itemGlow: new THREE.MeshBasicMaterial({
        color: 0x47dfff,
        transparent: true,
        opacity: 0.52,
        side: THREE.DoubleSide,
      }),
      coin: new THREE.MeshStandardMaterial({
        color: 0xffd03d,
        emissive: 0xcc8b18,
        emissiveIntensity: 0.35,
        roughness: 0.34,
        metalness: 0.3,
        flatShading: true,
      }),
      boostPad: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: makeBoostPadTexture(),
        emissive: 0x1680ff,
        emissiveIntensity: 0.85,
        roughness: 0.45,
        flatShading: true,
      }),
      ramp: new THREE.MeshStandardMaterial({
        color: 0xffca3a,
        emissive: 0xff7b22,
        emissiveIntensity: 0.32,
        roughness: 0.52,
        flatShading: true,
      }),
      rampEdge: new THREE.MeshStandardMaterial({
        color: 0x1b2228,
        roughness: 0.68,
        flatShading: true,
      }),
      rocket: new THREE.MeshStandardMaterial({ color: 0x29b6ff, emissive: 0x0f6dff, emissiveIntensity: 0.55, flatShading: true }),
      seeker: new THREE.MeshStandardMaterial({ color: 0xff3d57, emissive: 0xaa1025, emissiveIntensity: 0.55, flatShading: true }),
      mine: new THREE.MeshStandardMaterial({ color: 0x1f252a, emissive: 0x6fe26f, emissiveIntensity: 0.35, flatShading: true }),
      pulse: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.62 }),
      leaderDrone: new THREE.MeshStandardMaterial({ color: 0x3fd8ff, emissive: 0x1a92ff, emissiveIntensity: 0.9, flatShading: true }),
    } : {};

    if (this.populateItemBoxes) this.createItemBoxes();
    if (this.populateCoins) this.createCoins();
    if (this.populateBoostPads) this.createBoostPads();
    if (this.populateTrickRamps) this.createTrickRamps();
  }

  createItem(type, uses = null) {
    const item = cloneItem(type);
    if (Number.isFinite(Number(uses))) {
      item.uses = Math.max(1, Number(uses));
    }
    return item;
  }

  createItemBoxes() {
    const boxGeo = new THREE.BoxGeometry(2.05, 2.05, 2.05, 1, 1, 1);
    const wireGeo = new THREE.BoxGeometry(2.22, 2.22, 2.22, 1, 1, 1);
    const ringGeo = new THREE.TorusGeometry(1.62, 0.065, 6, 20);
    const rows = [0.095, 0.145, 0.215, 0.292, 0.37, 0.49, 0.585, 0.665, 0.735, 0.815, 0.89, 0.955];
    const lanes = [-7.1, -2.35, 2.35, 7.1];

    for (const progress of rows) {
      for (const lateral of lanes) {
        const frame = this.track.getFrameAtProgress(progress);
        const group = new THREE.Group();
        group.position.copy(frame.point).addScaledVector(frame.normal, lateral);
        group.position.y = 1.35;
        group.rotation.y = yawFromDirection(frame.tangent);

        const box = new THREE.Mesh(boxGeo, this.materials.itemBox);
        const wire = new THREE.Mesh(wireGeo, this.materials.itemWire);
        const ring = new THREE.Mesh(ringGeo, this.materials.itemGlow);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = -1.18;
        group.add(box, wire, ring);
        group.traverse((child) => {
          if (child.isMesh) child.castShadow = true;
        });
        this.scene.add(group);
        this.itemBoxes.push({ group, progress, lateral, cooldown: 0 });
      }
    }
  }

  createCoins() {
    const coinGeo = new THREE.TorusGeometry(0.66, 0.09, 6, 16);
    const rows = [0.038, 0.095, 0.165, 0.265, 0.345, 0.425, 0.52, 0.61, 0.705, 0.785, 0.87, 0.94];
    const lanes = [-4, 0, 4];

    for (const progress of rows) {
      for (const lateral of lanes) {
        const frame = this.track.getFrameAtProgress(progress);
        const coin = new THREE.Mesh(coinGeo, this.materials.coin);
        coin.position.copy(frame.point).addScaledVector(frame.normal, lateral);
        coin.position.y = 1.0;
        coin.rotation.y = yawFromDirection(frame.tangent);
        coin.castShadow = true;
        this.scene.add(coin);
        this.coins.push({ mesh: coin, progress, lateral, cooldown: 0 });
      }
    }
  }

  createBoostPads() {
    const padGeo = new THREE.BoxGeometry(5.8, 0.08, 9.2);
    const padConfigs = [
      [0.078, -5.5],
      [0.162, 5.4],
      [0.278, 4.8],
      [0.338, -5.1],
      [0.506, 4.6],
      [0.622, -5.2],
      [0.705, -4.7],
      [0.832, 5.1],
      [0.905, -5.0],
      [0.965, 4.9],
    ];

    for (const [progress, lateral] of padConfigs) {
      const frame = this.track.getFrameAtProgress(progress);
      const pad = new THREE.Mesh(padGeo, this.materials.boostPad);
      pad.position.copy(frame.point).addScaledVector(frame.normal, lateral);
      pad.position.y = 0.11;
      pad.rotation.y = yawFromDirection(frame.tangent);
      pad.receiveShadow = true;
      this.scene.add(pad);
      this.boostPads.push({ mesh: pad, progress, lateral, cooldowns: new Map() });
    }
  }

  createTrickRamps() {
    const positions = [
      [0.248, 0],
      [0.438, 0],
      [0.552, -3.8],
      [0.756, 3.8],
      [0.205, -7.2],
      [0.695, -7.2],
    ];
    const rampGeo = this.createRampGeometry(8.6, 6.2, 1.15);
    const edgeGeo = new THREE.BoxGeometry(0.34, 0.22, 6.6);

    for (const [progress, lateral] of positions) {
      const frame = this.track.getFrameAtProgress(progress);
      const group = new THREE.Group();
      group.position.copy(frame.point).addScaledVector(frame.normal, lateral);
      group.position.y = 0.1;
      group.rotation.y = yawFromDirection(frame.tangent);

      const ramp = new THREE.Mesh(rampGeo, this.materials.ramp);
      ramp.receiveShadow = true;
      ramp.castShadow = true;
      group.add(ramp);

      for (const side of [-1, 1]) {
        const edge = new THREE.Mesh(edgeGeo, this.materials.rampEdge);
        edge.position.set(side * 4.48, 0.18, 0);
        edge.castShadow = true;
        edge.receiveShadow = true;
        group.add(edge);
      }

      this.scene.add(group);
      this.trickRamps.push({ group, progress, lateral, cooldowns: new Map() });
    }
  }

  createRampGeometry(width, depth, height) {
    const w = width / 2;
    const d = depth / 2;
    const positions = [
      -w, 0, -d, w, 0, -d, -w, height, d, w, height, d,
      -w, 0, -d, -w, height, d, w, 0, -d, w, height, d,
    ];
    const indices = [
      0, 1, 2, 1, 3, 2,
      4, 6, 5,
      6, 7, 5,
    ];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  reset(karts) {
    for (const box of this.itemBoxes) {
      box.cooldown = 0;
      box.group.visible = true;
    }
    for (const coin of this.coins) {
      coin.cooldown = 0;
      coin.mesh.visible = true;
    }
    for (const pad of this.boostPads) {
      pad.cooldowns.clear();
    }
    for (const ramp of this.trickRamps) {
      ramp.cooldowns.clear();
    }
    for (const projectile of this.projectiles) this.scene.remove(projectile.mesh);
    for (const trap of this.traps) this.scene.remove(trap.mesh);
    for (const effect of this.effects) this.scene.remove(effect.mesh);
    this.projectiles.length = 0;
    this.traps.length = 0;
    this.effects.length = 0;
    this.events.length = 0;

    for (const kart of karts) {
      kart.heldItem = null;
      kart.pendingItem = null;
      kart.itemRouletteTimer = 0;
      kart.itemUseCooldown = 0;
      kart.aiItemDelay = this.enabled ? randomRange(this.random, 0.7, 2.2) : 0;
      kart.coinCount = 0;
      kart.invincibleTimer = 0;
      kart.stunTimer = 0;
      kart.slowTimer = 0;
      kart.visualScale = 1;
      kart.slipstreamCharge = 0;
      kart.boostTimer = 0;
      kart.jumpTimer = 0;
      kart.jumpDuration = 0;
    }
  }

  update(dt, karts, raceManager, playerWantsItem) {
    if (!this.enabled) {
      this.clearDisabledKartState(karts);
      return;
    }

    this.updateKartTimers(karts, dt);
    this.animatePickups(dt);

    if (!raceManager.isRunning()) return;

    this.handleItemUse(karts[0], raceManager, playerWantsItem);
    this.handleAIItemUse(karts, raceManager, dt);
    this.updateItemBoxes(karts, raceManager, dt);
    this.updateCoins(karts, dt);
    this.updateBoostPads(karts, dt);
    this.updateTrickRamps(karts, dt);
    this.updateProjectiles(karts, raceManager, dt);
    this.updateTraps(karts, dt);
    this.updateEffects(dt);
  }

  clearDisabledKartState(karts) {
    for (const kart of karts) {
      kart.heldItem = null;
      kart.pendingItem = null;
      kart.itemRouletteTimer = 0;
      kart.itemUseCooldown = 0;
      kart.aiItemDelay = 0;
      kart.coinCount = 0;
      kart.invincibleTimer = 0;
      kart.stunTimer = 0;
      kart.slowTimer = 0;
      kart.visualScale = 1;
      kart.slipstreamCharge = 0;
      kart.boostTimer = 0;
      kart.jumpTimer = 0;
      kart.jumpDuration = 0;
    }
  }

  updateKartTimers(karts, dt) {
    for (const kart of karts) {
      kart.itemUseCooldown = Math.max(0, (kart.itemUseCooldown ?? 0) - dt);
      kart.invincibleTimer = Math.max(0, (kart.invincibleTimer ?? 0) - dt);
      kart.stunTimer = Math.max(0, (kart.stunTimer ?? 0) - dt);
      kart.slowTimer = Math.max(0, (kart.slowTimer ?? 0) - dt);
      kart.visualScale = kart.slowTimer > 0 ? 0.88 : 1;

      if (kart.invincibleTimer > 0) {
        kart.boostTimer = Math.max(kart.boostTimer, 0.08);
      }

      if (kart.itemRouletteTimer > 0) {
        kart.itemRouletteTimer -= dt;
        if (kart.itemRouletteTimer <= 0 && kart.pendingItem) {
          kart.heldItem = kart.pendingItem;
          kart.pendingItem = null;
          kart.aiItemDelay = randomRange(this.random, 0.55, 1.75);
          this.emitForKart(kart, 'itemReady', {
            title: 'BONUS PRET',
            label: `${kart.heldItem.label} - E/F/SHIFT`,
            short: kart.heldItem.icon,
            color: kart.heldItem.color,
          });
        }
      }
    }
  }

  animatePickups(dt) {
    for (const box of this.itemBoxes) {
      box.group.rotation.y += dt * 1.7;
      box.group.rotation.x = Math.sin(performance.now() * 0.002 + box.progress * 10) * 0.14;
      if (box.cooldown > 0) {
        box.cooldown -= dt;
        if (box.cooldown <= 0) box.group.visible = true;
      }
    }
    for (const coin of this.coins) {
      coin.mesh.rotation.y += dt * 4;
      coin.mesh.position.y = 1 + Math.sin(performance.now() * 0.004 + coin.progress * 8) * 0.13;
      if (coin.cooldown > 0) {
        coin.cooldown -= dt;
        if (coin.cooldown <= 0) coin.mesh.visible = true;
      }
    }
    for (const pad of this.boostPads) {
      const pulse = 0.8 + Math.sin(performance.now() * 0.008 + pad.progress * 20) * 0.2;
      pad.mesh.material.emissiveIntensity = pulse;
    }
  }

  updateItemBoxes(karts, raceManager, dt) {
    for (const box of this.itemBoxes) {
      if (box.cooldown > 0) continue;
      for (const kart of karts) {
        if (kart.heldItem || kart.pendingItem || kart.itemRouletteTimer > 0) continue;
        if (distanceSq2D(kart.position, box.group.position) > 10.4) continue;
        box.cooldown = 5.5;
        box.group.visible = false;
        this.spawnRingEffect(box.group.position, 0xffffff, 5.4, 0.52, 1.1, 0.72);
        this.startRoulette(kart, raceManager);
        this.emitForKart(kart, 'roulette', {
          title: 'BONUS BOX',
          label: 'Roulette bonus',
          short: 'ROLL',
          color: 0xffffff,
        });
        break;
      }
    }
  }

  updateCoins(karts, dt) {
    for (const coin of this.coins) {
      if (coin.cooldown > 0) continue;
      for (const kart of karts) {
        if (distanceSq2D(kart.position, coin.mesh.position) > 6.2) continue;
        coin.cooldown = 6.5;
        coin.mesh.visible = false;
        this.spawnRingEffect(coin.mesh.position, 0xffd03d, 3.8, 0.38, 0.55, 0.7);
        this.addCoins(kart, 1);
        kart.boostTimer = Math.max(kart.boostTimer, 0.16);
        kart.collisionImpulse = Math.max(kart.collisionImpulse, 0.18);
        this.emitForKart(kart, 'coin', {
          title: '+1 COIN',
          label: `${kart.coinCount} / 10`,
          short: 'COIN',
          color: 0xffd03d,
        });
        break;
      }
    }
  }

  updateBoostPads(karts, dt) {
    for (const pad of this.boostPads) {
      for (const [id, cooldown] of pad.cooldowns) {
        const next = cooldown - dt;
        if (next <= 0) pad.cooldowns.delete(id);
        else pad.cooldowns.set(id, next);
      }

      for (const kart of karts) {
        if (pad.cooldowns.has(kart.id)) continue;
        if (distanceSq2D(kart.position, pad.mesh.position) > 22) continue;
        pad.cooldowns.set(kart.id, 1.4);
        this.applyBoost(kart, 0.95, {
          title: 'BOOST PAD',
          label: 'Speed burst',
          short: 'BOOST',
          color: 0x2ed6ff,
        });
      }
    }
  }

  updateTrickRamps(karts, dt) {
    for (const ramp of this.trickRamps) {
      for (const [id, cooldown] of ramp.cooldowns) {
        const next = cooldown - dt;
        if (next <= 0) ramp.cooldowns.delete(id);
        else ramp.cooldowns.set(id, next);
      }

      ramp.group.rotation.z = Math.sin(performance.now() * 0.006 + ramp.progress * 12) * 0.015;
      for (const kart of karts) {
        if (ramp.cooldowns.has(kart.id)) continue;
        if (distanceSq2D(kart.position, ramp.group.position) > 26) continue;
        ramp.cooldowns.set(kart.id, 1.6);
        kart.jumpDuration = 0.48;
        kart.jumpTimer = Math.max(kart.jumpTimer, kart.jumpDuration);
        this.applyBoost(kart, 0.55, {
          title: 'JUMP BOOST',
          label: 'Trick landing',
          short: 'JUMP',
          color: 0xffca3a,
        });
      }
    }
  }

  startRoulette(kart, raceManager) {
    kart.pendingItem = this.pickItemForKart(kart, raceManager);
    kart.itemRouletteTimer = 0.72;
  }

  pickItemForKart(kart, raceManager) {
    const position = raceManager.getPosition(kart.id);
    const total = Math.max(1, raceManager.positions.length);
    const normalized = total <= 1 ? 0 : (position - 1) / (total - 1);
    const table = normalized < 0.25
      ? [
        ['skidMine', 32], ['coinBurst', 24], ['rocket', 16], ['pulse', 14],
        ['turbo', 10], ['seeker', 4],
      ]
      : normalized < 0.66
        ? [
          ['turbo', 22], ['seeker', 22], ['rocket', 18], ['skidMine', 16],
          ['tripleTurbo', 12], ['pulse', 8], ['coinBurst', 7],
        ]
        : [
          ['tripleTurbo', 24], ['seeker', 20], ['leaderDrone', 17], ['star', 14],
          ['storm', 11], ['turbo', 10], ['rocket', 8],
        ];

    const totalWeight = table.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = this.random() * totalWeight;
    for (const [type, weight] of table) {
      roll -= weight;
      if (roll <= 0) return cloneItem(type);
    }
    return cloneItem('turbo');
  }

  handleItemUse(kart, raceManager, requested) {
    if (!requested || !kart.heldItem || kart.itemUseCooldown > 0 || kart.itemRouletteTimer > 0) return;
    this.useItem(kart, raceManager);
  }

  handleAIItemUse(karts, raceManager, dt) {
    for (let i = 1; i < karts.length; i += 1) {
      const kart = karts[i];
      if (!kart.heldItem || kart.itemUseCooldown > 0 || kart.itemRouletteTimer > 0) continue;
      kart.aiItemDelay = Math.max(0, (kart.aiItemDelay ?? 1) - dt);
      if (kart.aiItemDelay > 0) continue;

      const position = raceManager.getPosition(kart.id);
      const item = kart.heldItem.type;
      const shouldUse =
        item === 'skidMine' ||
        item === 'pulse' ||
        item === 'storm' ||
        item === 'star' ||
        item === 'leaderDrone' ||
        position > 2 ||
        this.random() > 0.4;
      if (shouldUse) this.useItem(kart, raceManager);
      else kart.aiItemDelay = randomRange(this.random, 0.8, 1.8);
    }
  }

  useItem(kart, raceManager) {
    const item = kart.heldItem;
    if (!item) return;
    kart.itemUseCooldown = 0.35;
    this.emitForKart(kart, 'itemUse', {
      title: 'BONUS ACTIVE',
      label: item.effect,
      short: item.icon,
      color: item.color,
    });
    this.spawnKartBurst(kart, item.color, item.type === 'storm' ? 16 : 7, item.type === 'storm' ? 0.72 : 0.42);

    if (item.type === 'turbo' || item.type === 'tripleTurbo') {
      this.applyBoost(kart, item.type === 'tripleTurbo' ? 0.78 : 1.05);
    } else if (item.type === 'rocket') {
      this.spawnProjectile(kart, 'rocket');
    } else if (item.type === 'seeker') {
      this.spawnProjectile(kart, 'seeker', this.findTargetAhead(kart, raceManager));
    } else if (item.type === 'leaderDrone') {
      const leader = raceManager.positions.find((candidate) => candidate.id !== kart.id);
      this.spawnProjectile(kart, 'leaderDrone', leader);
    } else if (item.type === 'skidMine') {
      this.dropMine(kart);
    } else if (item.type === 'pulse') {
      this.firePulse(kart, raceManager.positions);
    } else if (item.type === 'storm') {
      this.fireStorm(kart, raceManager.positions);
    } else if (item.type === 'star') {
      kart.invincibleTimer = Math.max(kart.invincibleTimer, 5.2);
      this.applyBoost(kart, 1.3);
      kart.collisionImpulse = Math.max(kart.collisionImpulse, 0.8);
    } else if (item.type === 'coinBurst') {
      this.addCoins(kart, 2);
      this.emitForKart(kart, 'coin', {
        title: '+2 COINS',
        label: `${kart.coinCount} / 10`,
        short: 'COINS',
        color: 0xffd03d,
      });
      this.applyBoost(kart, 0.36);
    }

    item.uses -= 1;
    if (item.uses <= 0) kart.heldItem = null;
  }

  applyBoost(kart, duration, feedback = null) {
    kart.getForwardVector(tmpForward);
    const forwardSpeed = kart.velocity.dot(tmpForward);
    const baseImpulse = duration < 0.5 ? 11.5 : 18.5;
    const recoveryKick = forwardSpeed < 11 ? (11 - forwardSpeed) * 0.72 : 0;
    kart.velocity.addScaledVector(tmpForward, baseImpulse + recoveryKick);
    tmpVectorB.copy(kart.velocity).addScaledVector(tmpForward, -kart.velocity.dot(tmpForward));
    if (tmpVectorB.lengthSq() > 196) {
      kart.velocity.addScaledVector(tmpVectorB, -0.28);
    }
    kart.boostTimer = Math.max(kart.boostTimer, duration);
    kart.stunTimer = 0;
    kart.slowTimer = Math.max(0, (kart.slowTimer ?? 0) - duration * 1.6);
    kart.collisionImpulse = Math.max(kart.collisionImpulse, duration < 0.5 ? 0.42 : 0.62);
    this.spawnKartBurst(kart, feedback?.color ?? 0xff8a28, duration < 0.5 ? 4.6 : 6.8, 0.36);
    if (feedback) this.emitForKart(kart, 'boost', feedback);
  }

  spawnKartBurst(kart, color, maxScale = 6.5, life = 0.42) {
    this.spawnRingEffect(kart.position, color, maxScale, life, 0.45, 0.7);
  }

  spawnRingEffect(position, color, maxScale = 6.5, life = 0.45, height = 0.45, opacity = 0.62) {
    const material = this.materials.pulse.clone();
    material.color.setHex(color);
    material.opacity = opacity;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.075, 6, 34), material);
    ring.position.copy(position);
    ring.position.y = height;
    ring.rotation.x = Math.PI / 2;
    this.scene.add(ring);
    this.effects.push({ mesh: ring, age: 0, life, maxScale, spin: 3.2 });
  }

  addCoins(kart, amount) {
    kart.coinCount = clamp((kart.coinCount ?? 0) + amount, 0, 10);
  }

  dropCoins(kart, amount = 2) {
    kart.coinCount = Math.max(0, (kart.coinCount ?? 0) - amount);
  }

  spawnProjectile(owner, type, target = null) {
    owner.getForwardVector(tmpForward);
    const mesh = this.createProjectileMesh(type);
    mesh.position.copy(owner.position).addScaledVector(tmpForward, 3.4);
    mesh.position.y = 0.72;
    mesh.rotation.y = yawFromDirection(tmpForward);
    this.scene.add(mesh);

    const speed = type === 'leaderDrone' ? 70 : type === 'seeker' ? 58 : 52;
    const projectile = {
      type,
      owner,
      target,
      mesh,
      velocity: tmpForward.clone().multiplyScalar(speed),
      life: type === 'leaderDrone' ? 8.0 : 5.0,
      hitRadius: type === 'leaderDrone' ? 3.4 : 2.35,
    };
    this.projectiles.push(projectile);
  }

  createProjectileMesh(type) {
    if (type === 'leaderDrone') {
      const group = new THREE.Group();
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.74, 0), this.materials.leaderDrone);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.055, 6, 14), this.materials.leaderDrone);
      ring.rotation.x = Math.PI / 2;
      group.add(core, ring);
      return group;
    }

    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.ConeGeometry(0.48, 1.35, 8),
      type === 'seeker' ? this.materials.seeker : this.materials.rocket,
    );
    body.rotation.x = Math.PI / 2;
    const tail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.32, 0.62, 8),
      type === 'seeker' ? this.materials.seeker : this.materials.rocket,
    );
    tail.rotation.x = Math.PI / 2;
    tail.position.z = -0.74;
    group.add(body, tail);
    return group;
  }

  dropMine(owner) {
    owner.getForwardVector(tmpForward);
    const mesh = new THREE.Group();
    const base = new THREE.Mesh(new THREE.OctahedronGeometry(0.72, 0), this.materials.mine);
    const glow = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 6, 14), this.materials.mine);
    glow.rotation.x = Math.PI / 2;
    mesh.add(base, glow);
    mesh.position.copy(owner.position).addScaledVector(tmpForward, -3.1);
    mesh.position.y = 0.48;
    this.scene.add(mesh);
    this.traps.push({ owner, mesh, armedTimer: 0.65, life: 16 });
  }

  firePulse(owner, karts) {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 32), this.materials.pulse.clone());
    mesh.position.copy(owner.position);
    mesh.position.y = 0.52;
    mesh.rotation.x = Math.PI / 2;
    this.scene.add(mesh);
    this.effects.push({ mesh, age: 0, life: 0.42, maxScale: 15 });

    for (const kart of karts) {
      if (kart.id === owner.id) continue;
      if (distanceSq2D(kart.position, owner.position) > 15 * 15) continue;
      this.hitKart(kart, owner, 'pulse');
    }
    this.projectiles = this.projectiles.filter((projectile) => {
      if (distanceSq2D(projectile.mesh.position, owner.position) > 17 * 17) return true;
      this.scene.remove(projectile.mesh);
      return false;
    });
  }

  fireStorm(owner, karts) {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 6, 40), this.materials.pulse.clone());
    mesh.material.color.setHex(0x8b69ff);
    mesh.position.copy(owner.position);
    mesh.position.y = 0.6;
    mesh.rotation.x = Math.PI / 2;
    this.scene.add(mesh);
    this.effects.push({ mesh, age: 0, life: 0.72, maxScale: 38 });

    for (const kart of karts) {
      if (kart.id === owner.id) continue;
      if (kart.invincibleTimer > 0) continue;
      kart.slowTimer = Math.max(kart.slowTimer, 3.2);
      kart.stunTimer = Math.max(kart.stunTimer, 0.35);
      kart.boostTimer = 0;
      kart.collisionImpulse = Math.max(kart.collisionImpulse, 0.7);
      this.dropCoins(kart, 3);
    }
  }

  updateProjectiles(karts, raceManager, dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const projectile = this.projectiles[i];
      projectile.life -= dt;
      if (projectile.life <= 0) {
        this.scene.remove(projectile.mesh);
        this.projectiles.splice(i, 1);
        continue;
      }

      if ((projectile.type === 'seeker' || projectile.type === 'leaderDrone') && projectile.target) {
        tmpVector.copy(projectile.target.position).sub(projectile.mesh.position).setY(0);
        if (tmpVector.lengthSq() > 0.001) {
          const speed = projectile.velocity.length();
          tmpVector.normalize().multiplyScalar(speed);
          projectile.velocity.lerp(tmpVector, 1 - Math.exp(-dt * (projectile.type === 'leaderDrone' ? 3.8 : 2.8)));
        }
      }

      projectile.mesh.position.addScaledVector(projectile.velocity, dt);
      projectile.mesh.position.y = projectile.type === 'leaderDrone' ? 1.35 : 0.72;
      projectile.mesh.rotation.y = yawFromDirection(projectile.velocity);
      projectile.mesh.rotation.z += dt * 4;

      for (const kart of karts) {
        if (kart.id === projectile.owner.id) continue;
        const radius = projectile.hitRadius + kart.collisionRadius;
        if (distanceSq2D(kart.position, projectile.mesh.position) > radius * radius) continue;
        this.hitKart(kart, projectile.owner, projectile.type);
        this.scene.remove(projectile.mesh);
        this.projectiles.splice(i, 1);
        break;
      }
    }
  }

  updateTraps(karts, dt) {
    for (let i = this.traps.length - 1; i >= 0; i -= 1) {
      const trap = this.traps[i];
      trap.life -= dt;
      trap.armedTimer = Math.max(0, trap.armedTimer - dt);
      trap.mesh.rotation.y += dt * 2.4;
      if (trap.life <= 0) {
        this.scene.remove(trap.mesh);
        this.traps.splice(i, 1);
        continue;
      }

      for (const kart of karts) {
        if (kart.id === trap.owner.id && trap.armedTimer > 0) continue;
        if (distanceSq2D(kart.position, trap.mesh.position) > 8.6) continue;
        this.hitKart(kart, trap.owner, 'skidMine');
        this.scene.remove(trap.mesh);
        this.traps.splice(i, 1);
        break;
      }
    }
  }

  updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i -= 1) {
      const effect = this.effects[i];
      effect.age += dt;
      const t = clamp(effect.age / effect.life, 0, 1);
      effect.mesh.scale.setScalar(1 + t * effect.maxScale);
      effect.mesh.rotation.z += dt * (effect.spin ?? 0);
      effect.mesh.material.opacity = 0.62 * (1 - t);
      if (t >= 1) {
        this.scene.remove(effect.mesh);
        this.effects.splice(i, 1);
      }
    }
  }

  hitKart(kart, source, type) {
    if (kart.invincibleTimer > 0) {
      kart.boostTimer = Math.max(kart.boostTimer, 0.28);
      return;
    }

    const heavy = type === 'leaderDrone' || type === 'storm';
    kart.stunTimer = Math.max(kart.stunTimer, heavy ? 1.15 : 0.72);
    kart.slowTimer = Math.max(kart.slowTimer, heavy ? 1.8 : 0.7);
    kart.boostTimer = 0;
    kart.velocity.multiplyScalar(heavy ? 0.28 : 0.42);
    kart.yaw += randomRange(this.random, -0.9, 0.9);
    kart.collisionImpulse = Math.max(kart.collisionImpulse, heavy ? 1 : 0.72);
    this.dropCoins(kart, heavy ? 3 : 2);
    this.emitForKart(kart, 'hit', {
      title: heavy ? 'BIG HIT' : 'HIT',
      label: type === 'skidMine' ? 'Mine' : type === 'seeker' ? 'Seeker' : 'Attack',
      short: '!',
      color: heavy ? 0xff3d57 : 0xff8a28,
    });

    if (source && source.id !== kart.id && source.invincibleTimer > 0) {
      source.boostTimer = Math.max(source.boostTimer, 0.35);
    }
  }

  findTargetAhead(kart, raceManager) {
    const position = raceManager.getPosition(kart.id);
    const index = raceManager.positions.findIndex((candidate) => candidate.id === kart.id);
    if (index > 0) return raceManager.positions[index - 1];
    return raceManager.positions.find((candidate) => candidate.id !== kart.id && raceManager.getPosition(candidate.id) > position);
  }

  getHUDState(playerKart) {
    if (!this.enabled) {
      return {
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
    }

    if (playerKart.itemRouletteTimer > 0) {
      return {
        itemLabel: 'Rolling',
        itemShort: 'ROLL',
        itemIcon: 'ROLL',
        itemColor: '#ffffff',
        itemHint: 'Patiente',
        itemVerb: 'ROULETTE',
        itemEffect: 'Selection du bonus',
        itemUses: 0,
        itemType: 'rolling',
      };
    }
    const item = playerKart.heldItem;
    return {
      itemLabel: item?.label ?? 'Empty',
      itemShort: item?.short ?? '-',
      itemIcon: item?.icon ?? '-',
      itemColor: item ? `#${item.color.toString(16).padStart(6, '0')}` : '#6f7b84',
      itemHint: item?.hint ?? '',
      itemVerb: item?.verb ?? '',
      itemEffect: item?.effect ?? '',
      itemUses: item?.uses ?? 0,
      itemType: item?.type ?? 'empty',
    };
  }

  emitForKart(kart, type, payload = {}) {
    if (!kart.isPlayer) return;
    this.events.push({
      id: this.eventId,
      kartId: kart.id,
      type,
      ...payload,
    });
    this.eventId += 1;
    if (this.events.length > 80) this.events.splice(0, this.events.length - 80);
  }

  consumeEventsFor(kartId) {
    const events = this.events.filter((event) => event.kartId === kartId);
    this.events = this.events.filter((event) => event.kartId !== kartId);
    return events;
  }
}
