import * as THREE from 'three';
import { makeSeededRandom, randomRange, wrap01, yawFromDirection } from '../utils/math.js';
import { createKenneyModel, KENNEY_ASSETS } from '../assets/KenneyAssets.js';

function setShadow(object, cast = true, receive = true) {
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = cast;
      child.receiveShadow = receive;
    }
  });
}

export class TrackDecor {
  constructor(scene, track) {
    this.scene = scene;
    this.track = track;
    this.random = makeSeededRandom(4242);
    this.materials = {
      barrierBlue: new THREE.MeshStandardMaterial({ color: 0x2d6cdf, roughness: 0.62, flatShading: true }),
      barrierWhite: new THREE.MeshStandardMaterial({ color: 0xf0f2e9, roughness: 0.7, flatShading: true }),
      barrierOrange: new THREE.MeshStandardMaterial({ color: 0xf07a2f, roughness: 0.68, flatShading: true }),
      edgeRail: new THREE.MeshStandardMaterial({ color: 0x252b30, roughness: 0.82, flatShading: true }),
      edgeRailLight: new THREE.MeshStandardMaterial({ color: 0xbfc6c5, roughness: 0.78, flatShading: true }),
      tire: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.82, flatShading: true }),
      cone: new THREE.MeshStandardMaterial({ color: 0xff6b21, roughness: 0.76, flatShading: true }),
      coneWhite: new THREE.MeshStandardMaterial({ color: 0xf4f4ed, roughness: 0.75, flatShading: true }),
      metal: new THREE.MeshStandardMaterial({ color: 0x444e57, roughness: 0.35, metalness: 0.35, flatShading: true }),
      wood: new THREE.MeshStandardMaterial({ color: 0x8c653d, roughness: 0.82, flatShading: true }),
      rock: new THREE.MeshStandardMaterial({ color: 0x77806f, roughness: 0.95, flatShading: true }),
      hill: new THREE.MeshStandardMaterial({ color: 0x5ca44d, roughness: 1, flatShading: true }),
      snow: new THREE.MeshStandardMaterial({ color: 0xe8f5fa, roughness: 0.92, flatShading: true }),
      ice: new THREE.MeshStandardMaterial({ color: 0x9ad7ef, roughness: 0.48, metalness: 0.04, flatShading: true }),
      sand: new THREE.MeshStandardMaterial({ color: 0xdcb260, roughness: 1, flatShading: true }),
      cactus: new THREE.MeshStandardMaterial({ color: 0x2f8b57, roughness: 0.86, flatShading: true }),
      cityWall: new THREE.MeshStandardMaterial({ color: 0x7d8990, roughness: 0.74, flatShading: true }),
      cityDark: new THREE.MeshStandardMaterial({ color: 0x29323a, roughness: 0.62, flatShading: true }),
      cityRoof: new THREE.MeshStandardMaterial({ color: 0xd45c36, roughness: 0.66, flatShading: true }),
      dirtWall: new THREE.MeshStandardMaterial({ color: 0x7b5131, roughness: 0.96, flatShading: true }),
      pineDark: new THREE.MeshStandardMaterial({ color: 0x1f5c43, roughness: 0.86, flatShading: true }),
      pineLight: new THREE.MeshStandardMaterial({ color: 0x2e8050, roughness: 0.86, flatShading: true }),
    };

    this.addBiomeLandmarks();
    this.addOptimizedBiomeScatter();
    this.addFinishArena();
    this.addTrees();
    this.addLowPolyTerrainProps();
    this.addSpectatorArea();
    this.addLamps();
  }

  addCircuitEdgeRails() {
    const railGeo = new THREE.BoxGeometry(0.58, 0.62, 12.4);
    const capGeo = new THREE.BoxGeometry(0.64, 0.16, 12.6);
    const step = 18 / this.track.totalLength;
    let index = 0;

    for (const side of [-1, 1]) {
      for (let p = 0; p < 1; p += step) {
        if (this.isShortcutVisualOpening(p, null, 0.014)) continue;
        const frame = this.track.getFrameAtProgress(p);
        const group = new THREE.Group();
        group.position
          .copy(frame.point)
          .addScaledVector(frame.normal, side * (this.track.halfWidth + 2.35));
        group.position.y = 0.08;
        group.rotation.y = yawFromDirection(frame.tangent);

        const rail = new THREE.Mesh(
          railGeo,
          index % 5 === 0 ? this.materials.edgeRailLight : this.materials.edgeRail,
        );
        rail.position.y = 0.31;
        const cap = new THREE.Mesh(capGeo, this.materials.edgeRailLight);
        cap.position.y = 0.7;
        group.add(rail, cap);
        setShadow(group);
        this.scene.add(group);
        index += 1;
      }
    }
  }

  isShortcutVisualOpening(progress, side = null, margin = 0.01) {
    const p = wrap01(progress);
    return (this.track.shortcutZones ?? []).some((zone) => (
      (side == null || zone.side === side) &&
      p >= zone.start - margin &&
      p <= zone.end + margin
    ));
  }

  getOuterSide(frame) {
    const dx = frame.point.x - this.track.center.x;
    const dz = frame.point.z - this.track.center.z;
    const dot = dx * frame.normal.x + dz * frame.normal.z;
    return dot >= 0 ? 1 : -1;
  }

  addSafetyBarriers() {
    this.addBarrierRun(0.02, 0.18);
    this.addBarrierRun(0.12, 0.26);
    this.addBarrierRun(0.31, 0.43);
    this.addBarrierRun(0.59, 0.78);
    this.addBarrierRun(0.83, 0.98);
  }

  addBarrierRun(start, end) {
    const barrierGeo = new THREE.BoxGeometry(1.1, 1.15, 4.6);
    const step = 8.6 / this.track.totalLength;
    let i = 0;
    for (let p = start; p < end; p += step) {
      const frame = this.track.getFrameAtProgress(p);
      const side = this.getOuterSide(frame);
      if (this.isShortcutVisualOpening(p, null, 0.014)) continue;
      const mesh = new THREE.Mesh(
        barrierGeo,
        i % 3 === 0
          ? this.materials.barrierBlue
          : i % 3 === 1
            ? this.materials.barrierWhite
            : this.materials.barrierOrange,
      );
      mesh.position
        .copy(frame.point)
        .addScaledVector(frame.normal, side * (this.track.halfWidth + 2.45));
      mesh.position.y = 0.58;
      mesh.rotation.y = yawFromDirection(frame.tangent);
      setShadow(mesh);
      this.scene.add(mesh);
      i += 1;
    }
  }

  addTireWalls() {
    this.addTireWall(0.395, 0.555);
    this.addTireWall(0.69, 0.765);
    this.addTireWall(0.89, 0.965);
  }

  addTireWall(start, end) {
    const tireGeo = new THREE.TorusGeometry(0.68, 0.22, 6, 12);
    const step = 5.8 / this.track.totalLength;
    let index = 0;
    for (let p = start; p < end; p += step) {
      const frame = this.track.getFrameAtProgress(p);
      const side = this.getOuterSide(frame);
      if (this.isShortcutVisualOpening(p, null, 0.014)) continue;
      for (let stack = 0; stack < 2; stack += 1) {
        const tire = new THREE.Mesh(tireGeo, this.materials.tire);
        tire.position
          .copy(frame.point)
          .addScaledVector(frame.normal, side * (this.track.halfWidth + 2.1));
        tire.position.y = 0.55 + stack * 0.75;
        tire.rotation.y = yawFromDirection(frame.tangent);
        tire.rotation.z = index % 2 === 0 ? 0.08 : -0.08;
        setShadow(tire);
        this.scene.add(tire);
      }
      index += 1;
    }
  }

  addSignsAndCones() {
    for (let p = 0.58; p < 0.75; p += 0.025) {
      const side = this.getOuterSide(this.track.getFrameAtProgress(p));
      this.addCone(p, side * (this.track.halfWidth + 0.92));
    }
  }

  addCone(progress, lateral) {
    const frame = this.track.getFrameAtProgress(progress);
    const coneGroup = new THREE.Group();
    coneGroup.position.copy(frame.point).addScaledVector(frame.normal, lateral);
    coneGroup.position.y = 0.03;

    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.38, 1.05, 16),
      this.materials.cone,
    );
    cone.position.y = 0.52;
    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.29, 0.11, 16),
      this.materials.coneWhite,
    );
    stripe.position.y = 0.6;
    coneGroup.add(cone, stripe);
    setShadow(coneGroup);
    this.scene.add(coneGroup);
  }

  addBiomeLandmarks() {
    this.addCityBlocks();
    this.addSnowSectionProps();
    this.addDirtCanyonProps();
    this.addDesertProps();
    this.addForestSectionProps();
  }

  addOptimizedBiomeScatter() {
    const dummy = new THREE.Object3D();
    const configs = [
      {
        name: 'CircuitGrass',
        start: 0.0,
        end: 0.16,
        count: 90,
        geometry: new THREE.ConeGeometry(0.8, 1.8, 5),
        material: this.materials.pineLight,
        minOffset: 22,
        maxOffset: 76,
        minScale: 0.55,
        maxScale: 1.25,
        y: 0.9,
      },
      {
        name: 'CityBlocks',
        start: 0.16,
        end: 0.31,
        count: 48,
        geometry: new THREE.BoxGeometry(2.2, 1.2, 2.2),
        material: this.materials.cityDark,
        minOffset: 22,
        maxOffset: 58,
        minScale: 0.8,
        maxScale: 2.2,
        y: 0.6,
      },
      {
        name: 'SnowRocks',
        start: 0.31,
        end: 0.47,
        count: 72,
        geometry: new THREE.DodecahedronGeometry(1.1, 0),
        material: this.materials.snow,
        minOffset: 18,
        maxOffset: 64,
        minScale: 0.8,
        maxScale: 2.2,
        y: 0.55,
      },
      {
        name: 'DirtBoulders',
        start: 0.47,
        end: 0.63,
        count: 80,
        geometry: new THREE.DodecahedronGeometry(1.25, 0),
        material: this.materials.dirtWall,
        minOffset: 18,
        maxOffset: 58,
        minScale: 0.9,
        maxScale: 2.6,
        y: 0.6,
      },
      {
        name: 'SandDunes',
        start: 0.63,
        end: 0.8,
        count: 96,
        geometry: new THREE.DodecahedronGeometry(1.2, 0),
        material: this.materials.sand,
        minOffset: 20,
        maxOffset: 72,
        minScale: 1.1,
        maxScale: 3.0,
        y: 0.35,
        flattenY: 0.32,
      },
      {
        name: 'ForestTrees',
        start: 0.8,
        end: 0.96,
        count: 120,
        geometry: new THREE.ConeGeometry(1.35, 4.4, 5),
        material: this.materials.pineDark,
        minOffset: 19,
        maxOffset: 78,
        minScale: 0.65,
        maxScale: 1.55,
        y: 2.2,
      },
    ];

    for (const config of configs) {
      const mesh = new THREE.InstancedMesh(config.geometry, config.material, config.count);
      mesh.name = `Optimized_${config.name}`;
      mesh.frustumCulled = true;
      mesh.castShadow = false;
      mesh.receiveShadow = false;

      for (let i = 0; i < config.count; i += 1) {
        const progress = randomRange(this.random, config.start, config.end);
        const side = this.random() > 0.5 ? 1 : -1;
        const lateral = side * randomRange(
          this.random,
          this.track.halfWidth + config.minOffset,
          this.track.halfWidth + config.maxOffset,
        );
        const { position, yaw } = this.getTrackPlacement(progress, lateral, config.y);
        const scale = randomRange(this.random, config.minScale, config.maxScale);
        dummy.position.copy(position);
        dummy.rotation.set(
          randomRange(this.random, -0.04, 0.04),
          yaw + randomRange(this.random, -Math.PI, Math.PI),
          randomRange(this.random, -0.04, 0.04),
        );
        dummy.scale.set(
          scale * randomRange(this.random, 0.72, 1.28),
          scale * (config.flattenY ?? 1),
          scale * randomRange(this.random, 0.72, 1.28),
        );
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }

      mesh.instanceMatrix.needsUpdate = true;
      this.scene.add(mesh);
    }
  }

  addFinishArena() {
    const finish = this.track.finishProgress ?? 0.035;
    const towerMat = new THREE.MeshStandardMaterial({ color: 0xf3d33b, roughness: 0.62, flatShading: true });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x151b20, roughness: 0.68, flatShading: true });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x8fd2ff,
      emissive: 0x1f5f8a,
      emissiveIntensity: 0.16,
      roughness: 0.34,
      flatShading: true,
    });
    const towerFrame = this.track.getFrameAtProgress(finish + 18 / this.track.totalLength);
    const towerSide = this.getOuterSide(towerFrame);
    const tower = new THREE.Group();
    tower.position
      .copy(towerFrame.point)
      .addScaledVector(towerFrame.normal, towerSide * (this.track.halfWidth + 24));
    tower.rotation.y = yawFromDirection(towerFrame.tangent) + (towerSide > 0 ? -0.22 : 0.22);

    const base = new THREE.Mesh(new THREE.BoxGeometry(9, 10, 8), darkMat);
    base.position.y = 5;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(13, 4.4, 9.5), towerMat);
    cab.position.y = 12.2;
    const window = new THREE.Mesh(new THREE.BoxGeometry(10.5, 2.1, 0.18), glassMat);
    window.position.set(0, 12.3, -4.84);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(15, 0.75, 10.8), darkMat);
    roof.position.y = 14.8;
    tower.add(base, cab, window, roof);
    setShadow(tower);
    this.scene.add(tower);

    for (let i = 0; i < 14; i += 1) {
      const p = finish - 16 / this.track.totalLength + (i * 5.2) / this.track.totalLength;
      for (const side of [-1, 1]) {
        const frame = this.track.getFrameAtProgress(p);
        const flag = new THREE.Group();
        flag.position
          .copy(frame.point)
          .addScaledVector(frame.normal, side * (this.track.halfWidth + 3.7));
        flag.rotation.y = yawFromDirection(frame.tangent);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 3.8, 6), this.materials.metal);
        pole.position.y = 1.9;
        const cloth = new THREE.Mesh(
          new THREE.PlaneGeometry(1.4, 0.9),
          new THREE.MeshStandardMaterial({
            color: i % 2 === 0 ? 0xf3d33b : 0x111820,
            side: THREE.DoubleSide,
            roughness: 0.72,
            flatShading: true,
          }),
        );
        cloth.position.set(side * 0.36, 3.25, 0);
        cloth.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        flag.add(pole, cloth);
        setShadow(flag);
        this.scene.add(flag);
      }
    }
  }

  getTrackPlacement(progress, lateral, y = 0) {
    const frame = this.track.getFrameAtProgress(progress);
    return {
      frame,
      position: frame.point.clone().addScaledVector(frame.normal, lateral).setY(y),
      yaw: yawFromDirection(frame.tangent),
    };
  }

  addKenneyAt(progress, lateral, assetUrl, options = {}) {
    const { position, yaw } = this.getTrackPlacement(progress, lateral, options.y ?? 0);
    if (options.avoidDriveable || options.name?.startsWith('Survival')) {
      this.keepDecorPositionOffDriveableAreas(position);
    }
    const model = createKenneyModel(assetUrl, {
      fitHeight: options.fitHeight,
      fitLength: options.fitLength,
      fitWidth: options.fitWidth,
      scale: options.scale,
      tint: options.tint,
      tintStrength: options.tintStrength,
      neutralTintStrength: options.neutralTintStrength,
      rotationY: yaw + (options.yawOffset ?? 0),
      position,
      localOffset: options.localOffset,
      castShadow: options.castShadow ?? true,
      receiveShadow: options.receiveShadow ?? true,
      name: options.name,
    });
    this.scene.add(model);
    return model;
  }

  keepDecorPositionOffDriveableAreas(position) {
    const mainClearance = this.track.halfWidth + 14;

    for (let i = 0; i < 5; i += 1) {
      let adjusted = false;
      const main = this.track.getNearestInfo(position);
      const mainAbs = Math.abs(main.lateral);
      if (mainAbs < mainClearance) {
        const sign = main.lateral >= 0 ? 1 : -1;
        position.addScaledVector(main.normal, sign * (mainClearance - mainAbs));
        adjusted = true;
      }

      const shortcut = this.track.getShortcutInfo(position, false);
      if (shortcut?.onShortcut) {
        const sign = shortcut.lateral >= 0 ? 1 : -1;
        const shortcutClearance = (shortcut.maxDriveableHalfWidth ?? 6) + 14;
        const shortcutAbs = Math.abs(shortcut.lateral);
        position.addScaledVector(shortcut.normal, sign * (shortcutClearance - shortcutAbs));
        adjusted = true;
      }

      if (!adjusted) break;
    }
  }

  getSafeSurvivalOffset(progress, side, offset) {
    const p = wrap01(progress);
    let safeOffset = offset;

    for (const zone of this.track.shortcutZones ?? []) {
      if (zone.side !== side) continue;
      if (p < zone.start - 0.012 || p > zone.end + 0.012) continue;
      safeOffset = Math.max(safeOffset, zone.outer - this.track.halfWidth + 20);
    }

    return safeOffset;
  }

  addKenneyAssetPass() {
    this.addKenneyCityDistrict();
    this.addKenneySnowVillage();
    this.addKenneyForestSuburb();
    this.addKenneySurvivalDecor();
  }

  addKenneyRoadEquipment() {
    const finish = this.track.finishProgress ?? 0.035;

    for (let i = 0; i < 10; i += 1) {
      const p = finish - 18 / this.track.totalLength + (i * 7.4) / this.track.totalLength;
      for (const side of [-1, 1]) {
        this.addKenneyAt(p, side * (this.track.halfWidth + 3.2), KENNEY_ASSETS.roads.constructionBarrier, {
          fitLength: 3.0,
          yawOffset: Math.PI / 2,
        });
      }
    }

    for (const p of [0.105, 0.19, 0.255, 0.445, 0.56, 0.765, 0.91]) {
      const frame = this.track.getFrameAtProgress(p);
      const side = this.getOuterSide(frame);
      this.addKenneyAt(p, side * (this.track.halfWidth + 7.2), KENNEY_ASSETS.roads.signHighway, {
        fitHeight: 5.2,
        yawOffset: side > 0 ? -0.4 : 0.4,
      });
    }

    for (const p of [0.048, 0.118, 0.188, 0.32, 0.47, 0.61, 0.78, 0.88, 0.96]) {
      const frame = this.track.getFrameAtProgress(p);
      const side = this.getOuterSide(frame);
      this.addKenneyAt(p, side * (this.track.halfWidth + 9.6), KENNEY_ASSETS.roads.lightCurved, {
        fitHeight: 8.2,
        yawOffset: side > 0 ? -0.35 : 0.35,
      });
    }

    for (const hazard of this.track.jumpHazards) {
      const before = hazard.start - 18 / this.track.totalLength;
      for (let i = 0; i < 6; i += 1) {
        const p = before + (i * 2.4) / this.track.totalLength;
        for (const side of [-1, 1]) {
          this.addKenneyAt(p, side * (this.track.halfWidth + 2.8), KENNEY_ASSETS.roads.constructionCone, {
            fitHeight: 1.1,
            yawOffset: i * 0.2,
          });
        }
      }
    }

    for (const [p, side, asset, fitLength] of [
      [finish + 10 / this.track.totalLength, -1, KENNEY_ASSETS.roads.crossing, 10],
      [0.252, 1, KENNEY_ASSETS.roads.bridge, 14],
      [0.445, -1, KENNEY_ASSETS.roads.bridge, 14],
      [0.765, 1, KENNEY_ASSETS.roads.bridge, 14],
    ]) {
      this.addKenneyAt(p, side * (this.track.halfWidth + 18), asset, {
        fitLength,
        y: 0.05,
        yawOffset: side * Math.PI * 0.5,
      });
    }
  }

  addKenneyCityDistrict() {
    const buildings = [
      KENNEY_ASSETS.commercial.buildingA,
      KENNEY_ASSETS.commercial.buildingC,
      KENNEY_ASSETS.commercial.buildingH,
      KENNEY_ASSETS.commercial.buildingK,
      KENNEY_ASSETS.commercial.buildingN,
    ];

    let index = 0;
    for (let p = 0.168; p < 0.305; p += 0.018) {
      for (const side of [-1, 1]) {
        const lateral = side * randomRange(this.random, this.track.halfWidth + 38, this.track.halfWidth + 82);
        this.addKenneyAt(p, lateral, buildings[index % buildings.length], {
          fitHeight: randomRange(this.random, 16, 34),
          yawOffset: randomRange(this.random, -0.22, 0.22),
        });
        index += 1;
      }
    }

    for (const p of [0.186, 0.214, 0.242, 0.276]) {
      const side = this.getOuterSide(this.track.getFrameAtProgress(p));
      this.addKenneyAt(p, side * (this.track.halfWidth + 18), KENNEY_ASSETS.commercial.parasol, {
        fitHeight: 2.6,
      });
      this.addKenneyAt(p + 5 / this.track.totalLength, side * (this.track.halfWidth + 20.8), KENNEY_ASSETS.commercial.awning, {
        fitLength: 5.4,
      });
    }
  }

  addKenneySnowVillage() {
    const snowTrees = [KENNEY_ASSETS.holiday.treeSnowA, KENNEY_ASSETS.holiday.treeSnowB];
    let index = 0;
    for (let p = 0.322; p < 0.462; p += 0.018) {
      for (const side of [-1, 1]) {
        if (this.random() < 0.25) continue;
        this.addKenneyAt(
          p,
          side * randomRange(this.random, this.track.halfWidth + 22, this.track.halfWidth + 56),
          snowTrees[index % snowTrees.length],
          { fitHeight: randomRange(this.random, 5.8, 9.6), yawOffset: this.random() * Math.PI },
        );
        index += 1;
      }
    }

    for (const [p, sideSign] of [[0.35, -1], [0.418, 1]]) {
      this.addKenneyAt(p, sideSign * (this.track.halfWidth + 42), KENNEY_ASSETS.holiday.cabinWall, {
        fitHeight: 8.2,
        yawOffset: sideSign > 0 ? -0.55 : 0.55,
      });
      this.addKenneyAt(p + 6 / this.track.totalLength, sideSign * (this.track.halfWidth + 35), KENNEY_ASSETS.holiday.snowman, {
        fitHeight: 2.3,
      });
      this.addKenneyAt(p - 7 / this.track.totalLength, sideSign * (this.track.halfWidth + 29), KENNEY_ASSETS.holiday.bench, {
        fitLength: 3.2,
        yawOffset: Math.PI / 2,
      });
    }
  }

  addKenneyForestSuburb() {
    const houses = [KENNEY_ASSETS.suburban.houseA, KENNEY_ASSETS.suburban.houseD, KENNEY_ASSETS.suburban.houseK];
    for (let p = 0.808; p < 0.925; p += 0.028) {
      const side = this.getOuterSide(this.track.getFrameAtProgress(p));
      this.addKenneyAt(p, side * randomRange(this.random, this.track.halfWidth + 42, this.track.halfWidth + 78), houses[Math.floor(this.random() * houses.length)], {
        fitHeight: randomRange(this.random, 7.5, 12),
        yawOffset: side > 0 ? -0.35 : 0.35,
      });
    }

    for (let p = 0.79; p < 0.94; p += 0.017) {
      for (const side of [-1, 1]) {
        if (this.random() < 0.35) continue;
        this.addKenneyAt(
          p,
          side * randomRange(this.random, this.track.halfWidth + 24, this.track.halfWidth + 66),
          this.random() > 0.45 ? KENNEY_ASSETS.suburban.treeLarge : KENNEY_ASSETS.suburban.treeSmall,
          { fitHeight: randomRange(this.random, 5.2, 9.8), yawOffset: this.random() * Math.PI },
        );
      }
    }
  }

  addKenneyPaddockVehicles() {
    const finish = this.track.finishProgress ?? 0.035;
    const cars = [
      KENNEY_ASSETS.car.race,
      KENNEY_ASSETS.car.raceFuture,
      KENNEY_ASSETS.car.taxi,
      KENNEY_ASSETS.car.van,
      KENNEY_ASSETS.car.truck,
    ];

    for (let i = 0; i < cars.length; i += 1) {
      const p = finish + (34 + i * 9) / this.track.totalLength;
      const side = i % 2 === 0 ? -1 : 1;
      this.addKenneyAt(p, side * (this.track.halfWidth + 18 + (i % 3) * 5), cars[i], {
        fitLength: i < 2 ? 4.5 : 5.8,
        yawOffset: side > 0 ? Math.PI * 0.58 : -Math.PI * 0.58,
      });
    }

    for (let i = 0; i < 18; i += 1) {
      const p = finish + (16 + i * 5.4) / this.track.totalLength;
      const side = i % 2 === 0 ? -1 : 1;
      this.addKenneyAt(p, side * (this.track.halfWidth + 7.5), i % 3 === 0 ? KENNEY_ASSETS.car.box : KENNEY_ASSETS.car.tire, {
        fitHeight: i % 3 === 0 ? 1.15 : 0.72,
        yawOffset: i * 0.37,
      });
    }
  }

  addKenneySurvivalDecor() {
    this.addKenneySurvivalTracksideScatter();
    this.addKenneySurvivalFenceRuns();
    this.addKenneySurvivalCampClusters();
    this.addKenneySurvivalForestThickening();
  }

  addKenneySurvivalTracksideScatter() {
    const S = KENNEY_ASSETS.survival;
    const rng = makeSeededRandom(9317);
    const zones = [
      {
        start: 0.012,
        end: 0.16,
        step: 0.022,
        minOffset: 20,
        maxOffset: 46,
        props: [
          { asset: S.patchGrassLarge, fitLength: 6.8 },
          { asset: S.grassLarge, fitHeight: 1.15 },
          { asset: S.rockFlatGrass, fitLength: 3.6 },
          { asset: S.resourceWood, fitLength: 3.8 },
          { asset: S.signpostSingle, fitHeight: 2.5 },
        ],
      },
      {
        start: 0.16,
        end: 0.31,
        step: 0.018,
        minOffset: 20,
        maxOffset: 42,
        props: [
          { asset: S.metalPanel, fitLength: 4.4 },
          { asset: S.metalPanelScrews, fitLength: 4.2 },
          { asset: S.boxLarge, fitHeight: 1.55 },
          { asset: S.barrel, fitHeight: 1.5 },
          { asset: S.resourcePlanks, fitLength: 4.2 },
        ],
      },
      {
        start: 0.31,
        end: 0.47,
        step: 0.026,
        minOffset: 24,
        maxOffset: 52,
        props: [
          { asset: S.resourceWood, fitLength: 4.0 },
          { asset: S.resourceStone, fitLength: 3.2 },
          { asset: S.rockFlat, fitLength: 4.4 },
          { asset: S.box, fitHeight: 1.15 },
          { asset: S.barrelOpen, fitHeight: 1.35 },
        ],
      },
      {
        start: 0.47,
        end: 0.63,
        step: 0.018,
        minOffset: 22,
        maxOffset: 52,
        props: [
          { asset: S.rockA, fitLength: 4.0 },
          { asset: S.rockB, fitLength: 3.6 },
          { asset: S.resourceStoneLarge, fitLength: 4.8 },
          { asset: S.resourcePlanks, fitLength: 4.0 },
          { asset: S.treeLog, fitLength: 4.8 },
          { asset: S.workbenchGrind, fitLength: 3.7 },
        ],
      },
      {
        start: 0.63,
        end: 0.8,
        step: 0.016,
        minOffset: 23,
        maxOffset: 58,
        props: [
          { asset: S.rockSandA, fitLength: 4.6 },
          { asset: S.rockSandB, fitLength: 3.8 },
          { asset: S.rockSandC, fitLength: 4.2 },
          { asset: S.signpost, fitHeight: 3.1 },
          { asset: S.tentCanvasHalf, fitLength: 5.2 },
          { asset: S.resourceWood, fitLength: 3.6 },
        ],
      },
      {
        start: 0.8,
        end: 0.93,
        step: 0.011,
        minOffset: 22,
        maxOffset: 56,
        props: [
          { asset: S.patchGrassLarge, fitLength: 7.8 },
          { asset: S.grass, fitHeight: 1.0 },
          { asset: S.grassLarge, fitHeight: 1.45 },
          { asset: S.rockFlatGrass, fitLength: 4.6 },
          { asset: S.treeLogSmall, fitLength: 4.0 },
          { asset: S.treeTrunk, fitHeight: 3.4 },
        ],
      },
      {
        start: 0.93,
        end: 0.995,
        step: 0.018,
        minOffset: 20,
        maxOffset: 42,
        props: [
          { asset: S.patchGrass, fitLength: 4.6 },
          { asset: S.boxOpen, fitHeight: 1.15 },
          { asset: S.barrel, fitHeight: 1.45 },
          { asset: S.signpostSingle, fitHeight: 2.6 },
          { asset: S.resourcePlanks, fitLength: 4.0 },
        ],
      },
    ];

    let index = 0;
    for (const zone of zones) {
      for (let p = zone.start; p < zone.end; p += zone.step) {
        for (const side of [-1, 1]) {
          if (rng() < 0.22) continue;
          const prop = zone.props[Math.floor(rng() * zone.props.length)];
          const progress = wrap01(p + randomRange(rng, -3.6, 3.6) / this.track.totalLength);
          const minOffset = this.getSafeSurvivalOffset(progress, side, zone.minOffset);
          const maxOffset = Math.max(zone.maxOffset, minOffset + 16);
          const lateral = side * randomRange(
            rng,
            this.track.halfWidth + minOffset,
            this.track.halfWidth + maxOffset,
          );
          this.addKenneyAt(progress, lateral, prop.asset, {
            fitHeight: prop.fitHeight,
            fitLength: prop.fitLength,
            fitWidth: prop.fitWidth,
            scale: prop.scale,
            y: prop.y ?? 0.025,
            yawOffset: randomRange(rng, -Math.PI, Math.PI),
            name: `SurvivalScatter_${index}`,
          });
          index += 1;
        }
      }
    }
  }

  addKenneySurvivalFenceRuns() {
    const S = KENNEY_ASSETS.survival;
    const rng = makeSeededRandom(5411);
    const runs = [
      { start: 0.045, end: 0.13, side: -1, offset: 18, stepMeters: 8.2, asset: S.fence, fitLength: 3.8 },
      { start: 0.19, end: 0.292, side: -1, offset: 18, stepMeters: 7.0, asset: S.metalPanelScrews, fitLength: 4.2 },
      { start: 0.204, end: 0.285, side: 1, offset: 20, stepMeters: 8.5, asset: S.fenceFortified, fitLength: 4.4 },
      { start: 0.498, end: 0.61, side: 1, offset: 20, stepMeters: 9.0, asset: S.fenceFortified, fitLength: 4.2 },
      { start: 0.666, end: 0.742, side: -1, offset: 21, stepMeters: 8.4, asset: S.fence, fitLength: 3.6 },
      { start: 0.818, end: 0.905, side: 1, offset: 19, stepMeters: 7.6, asset: S.fence, fitLength: 3.8 },
      { start: 0.94, end: 0.995, side: -1, offset: 18, stepMeters: 7.8, asset: S.fenceDoorway, fitLength: 4.0 },
    ];

    let index = 0;
    for (const run of runs) {
      const step = run.stepMeters / this.track.totalLength;
      for (let p = run.start; p < run.end; p += step) {
        const safeOffset = this.getSafeSurvivalOffset(p, run.side, run.offset);
        this.addKenneyAt(
          p,
          run.side * (this.track.halfWidth + safeOffset + randomRange(rng, -1.4, 1.4)),
          run.asset,
          {
            fitLength: run.fitLength,
            y: 0.025,
            yawOffset: Math.PI / 2 + randomRange(rng, -0.08, 0.08),
            name: `SurvivalFence_${index}`,
          },
        );
        index += 1;
      }
    }
  }

  addKenneySurvivalCampClusters() {
    const S = KENNEY_ASSETS.survival;
    const finish = this.track.finishProgress ?? 0.035;

    this.addSurvivalCluster('PaddockYard', finish + 0.083, -1, 27, [
      { asset: S.structureMetal, forward: -5, out: 7, fitLength: 9.5, yaw: -0.25 },
      { asset: S.workbench, forward: 4, out: -2, fitLength: 4.4, yaw: 0.4 },
      { asset: S.resourcePlanks, forward: 10, out: 4, fitLength: 4.8, yaw: -0.8 },
      { asset: S.boxLarge, forward: 14, out: -3, fitHeight: 1.45, yaw: 0.9 },
      { asset: S.barrel, forward: 18, out: 2, fitHeight: 1.45, yaw: -0.35 },
      { asset: S.signpostSingle, forward: -15, out: -1, fitHeight: 2.7, yaw: 0.15 },
    ]);

    this.addSurvivalCluster('CityDepot', 0.235, 1, 23, [
      { asset: S.structureMetalWall, forward: -8, out: 4, fitLength: 7.0, yaw: 0.35 },
      { asset: S.metalPanelNarrow, forward: -2, out: -5, fitLength: 4.4, yaw: Math.PI / 2 },
      { asset: S.metalPanel, forward: 5, out: -6, fitLength: 4.8, yaw: Math.PI / 2 },
      { asset: S.boxLarge, forward: 11, out: 1, fitHeight: 1.55, yaw: -0.45 },
      { asset: S.barrelOpen, forward: 15, out: -3, fitHeight: 1.35, yaw: 0.3 },
      { asset: S.resourceStone, forward: -15, out: -2, fitLength: 3.6, yaw: 0.75 },
    ]);

    this.addSurvivalCluster('DirtWorkshop', 0.548, 1, 27, [
      { asset: S.structure, forward: 0, out: 8, fitLength: 8.8, yaw: -0.15 },
      { asset: S.workbenchAnvil, forward: -9, out: -1, fitLength: 4.6, yaw: 0.62 },
      { asset: S.resourceStoneLarge, forward: 9, out: -4, fitLength: 5.2, yaw: -1.15 },
      { asset: S.resourcePlanks, forward: 16, out: 2, fitLength: 4.4, yaw: 0.35 },
      { asset: S.campfirePit, forward: -18, out: 3, fitLength: 2.8, yaw: 0.1 },
      { asset: S.chest, forward: -21, out: -2, fitLength: 2.2, yaw: -0.9 },
      { asset: S.signpost, forward: 22, out: -3, fitHeight: 3.1, yaw: 0.3 },
    ]);

    this.addSurvivalCluster('DuneCamp', 0.708, -1, 27, [
      { asset: S.tent, forward: -10, out: 6, fitLength: 7.4, yaw: 0.48 },
      { asset: S.tentCanvasHalf, forward: 8, out: 9, fitLength: 5.8, yaw: -0.55 },
      { asset: S.campfireStand, forward: 0, out: -1, fitLength: 3.8, yaw: 0.2 },
      { asset: S.rockSandA, forward: 16, out: -4, fitLength: 4.2, yaw: -0.2 },
      { asset: S.rockSandB, forward: -18, out: -3, fitLength: 3.8, yaw: 1.1 },
      { asset: S.bucket, forward: 6, out: -5, fitHeight: 0.9, yaw: -0.8 },
      { asset: S.bottleLarge, forward: -4, out: -5, fitHeight: 0.85, yaw: 0.55 },
      { asset: S.chest, forward: 21, out: 2, fitLength: 2.3, yaw: -0.35 },
    ]);

    this.addSurvivalCluster('ForestBase', 0.862, 1, 27, [
      { asset: S.structureCanvas, forward: -8, out: 7, fitLength: 8.2, yaw: -0.38 },
      { asset: S.tentCanvas, forward: 12, out: 8, fitLength: 6.6, yaw: 0.42 },
      { asset: S.bedroll, forward: -2, out: -3, fitLength: 3.0, yaw: 1.1 },
      { asset: S.resourceWood, forward: 18, out: -3, fitLength: 4.8, yaw: -0.4 },
      { asset: S.treeLog, forward: -18, out: 0, fitLength: 5.0, yaw: Math.PI / 2 },
      { asset: S.treeLogSmall, forward: -23, out: -4, fitLength: 3.8, yaw: -0.2 },
      { asset: S.chest, forward: 4, out: -5, fitLength: 2.2, yaw: -0.75 },
      { asset: S.campfirePit, forward: 24, out: 1, fitLength: 2.8, yaw: 0.2 },
    ]);

    this.addSurvivalCluster('FinishMarshal', 0.955, -1, 24, [
      { asset: S.signpost, forward: -12, out: -3, fitHeight: 3.2, yaw: -0.2 },
      { asset: S.fenceDoorway, forward: -5, out: 0, fitLength: 4.2, yaw: Math.PI / 2 },
      { asset: S.barrel, forward: 2, out: -4, fitHeight: 1.45, yaw: 0.45 },
      { asset: S.boxOpen, forward: 8, out: -1, fitHeight: 1.2, yaw: -0.65 },
      { asset: S.floorOld, forward: 13, out: 4, fitLength: 5.6, yaw: 0.18 },
      { asset: S.bucket, forward: 17, out: -3, fitHeight: 0.95, yaw: 0.3 },
    ]);
  }

  addSurvivalCluster(prefix, centerProgress, side, baseOffset, elements) {
    elements.forEach((element, index) => {
      const progress = wrap01(centerProgress + (element.forward ?? 0) / this.track.totalLength);
      const safeOffset = this.getSafeSurvivalOffset(progress, side, baseOffset + (element.out ?? 0));
      const lateral = side * (this.track.halfWidth + safeOffset);
      this.addKenneyAt(progress, lateral, element.asset, {
        fitHeight: element.fitHeight,
        fitLength: element.fitLength,
        fitWidth: element.fitWidth,
        scale: element.scale,
        y: element.y ?? 0.025,
        yawOffset: element.yaw ?? 0,
        name: `Survival${prefix}_${index}`,
      });
    });
  }

  addKenneySurvivalForestThickening() {
    const S = KENNEY_ASSETS.survival;
    const rng = makeSeededRandom(11921);
    const trees = [
      S.tree,
      S.treeTall,
      S.treeAutumn,
      S.treeAutumnTall,
      S.treeTrunk,
      S.treeAutumnTrunk,
    ];
    let index = 0;

    for (let p = 0.79; p < 0.96; p += 0.0095) {
      for (const side of [-1, 1]) {
        if (rng() < 0.28) continue;
        const farTree = rng() > 0.38;
        const progress = wrap01(p + randomRange(rng, -2.8, 2.8) / this.track.totalLength);
        const minOffset = this.getSafeSurvivalOffset(progress, side, farTree ? 42 : 24);
        const maxOffset = Math.max(farTree ? 86 : 44, minOffset + 18);
        const lateral = side * randomRange(
          rng,
          this.track.halfWidth + minOffset,
          this.track.halfWidth + maxOffset,
        );
        const asset = trees[Math.floor(rng() * trees.length)];
        const isTrunk = asset === S.treeTrunk || asset === S.treeAutumnTrunk;
        this.addKenneyAt(
          progress,
          lateral,
          asset,
          {
            fitHeight: isTrunk ? randomRange(rng, 3.2, 5.4) : randomRange(rng, 6.8, 13.5),
            y: 0.025,
            yawOffset: randomRange(rng, -Math.PI, Math.PI),
            name: `SurvivalForest_${index}`,
          },
        );
        index += 1;
      }
    }
  }

  addCityBlocks() {
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0xf3dc81,
      emissive: 0xa66e25,
      emissiveIntensity: 0.18,
      roughness: 0.42,
      flatShading: true,
    });

    for (let p = 0.17; p < 0.305; p += 0.017) {
      for (const side of [-1, 1]) {
        if (this.random() < 0.18) continue;
        const lateral = side * randomRange(this.random, this.track.halfWidth + 30, this.track.halfWidth + 68);
        const { position, yaw } = this.getTrackPlacement(p, lateral);
        const group = new THREE.Group();
        group.position.copy(position);
        group.rotation.y = yaw + randomRange(this.random, -0.25, 0.25);

        const width = randomRange(this.random, 8, 16);
        const depth = randomRange(this.random, 8, 15);
        const height = randomRange(this.random, 8, 22);
        const tower = new THREE.Mesh(
          new THREE.BoxGeometry(width, height, depth),
          this.materials.cityWall,
        );
        tower.position.y = height / 2;
        const roof = new THREE.Mesh(
          new THREE.ConeGeometry(width * 0.58, randomRange(this.random, 2.5, 5.2), 4),
          this.materials.cityRoof,
        );
        roof.position.y = height + 1.4;
        roof.rotation.y = Math.PI / 4;
        group.add(tower, roof);

        for (let i = 0; i < 3; i += 1) {
          const window = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 0.12), windowMat);
          window.position.set(-width * 0.28 + i * width * 0.28, height * 0.46, depth / 2 + 0.08);
          group.add(window);
        }

        setShadow(group);
        this.scene.add(group);
      }
    }
  }

  addSnowSectionProps() {
    for (let p = 0.315; p < 0.468; p += 0.012) {
      const side = this.random() > 0.5 ? 1 : -1;
      const lateral = side * randomRange(this.random, this.track.halfWidth + 24, this.track.halfWidth + 72);
      const { position } = this.getTrackPlacement(p, lateral);
      if (this.random() < 0.68) {
        this.addPineTree(position, randomRange(this.random, 4.5, 8.5), true);
      } else {
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(randomRange(this.random, 1.8, 4.6), 0),
          this.random() > 0.5 ? this.materials.snow : this.materials.ice,
        );
        rock.position.copy(position);
        rock.position.y = randomRange(this.random, 0.7, 1.5);
        rock.scale.set(1.6, 0.62, 1.15);
        rock.rotation.set(this.random() * Math.PI, this.random() * Math.PI, this.random() * Math.PI);
        setShadow(rock);
        this.scene.add(rock);
      }
    }
  }

  addPineTree(position, height, snowy = false) {
    const group = new THREE.Group();
    group.position.copy(position);
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.34, height * 0.48, 5),
      this.materials.wood,
    );
    trunk.position.y = height * 0.24;
    group.add(trunk);

    for (let i = 0; i < 3; i += 1) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(height * (0.28 - i * 0.045), height * 0.42, 5),
        snowy && i === 0 ? this.materials.snow : (i % 2 ? this.materials.pineLight : this.materials.pineDark),
      );
      cone.position.y = height * (0.52 + i * 0.19);
      group.add(cone);
    }

    setShadow(group);
    this.scene.add(group);
  }

  addDirtCanyonProps() {
    for (let p = 0.475; p < 0.632; p += 0.014) {
      for (const side of [-1, 1]) {
        if (this.random() < 0.38) continue;
        const lateral = side * randomRange(this.random, this.track.halfWidth + 24, this.track.halfWidth + 54);
        const { position, yaw } = this.getTrackPlacement(p, lateral);
        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(randomRange(this.random, 7, 15), randomRange(this.random, 6, 18), randomRange(this.random, 4, 9)),
          this.materials.dirtWall,
        );
        wall.position.copy(position);
        wall.position.y = wall.geometry.parameters.height / 2;
        wall.rotation.y = yaw + randomRange(this.random, -0.4, 0.4);
        wall.rotation.z = randomRange(this.random, -0.08, 0.08);
        setShadow(wall);
        this.scene.add(wall);
      }
    }
  }

  addDesertProps() {
    for (let p = 0.64; p < 0.798; p += 0.0125) {
      const side = this.random() > 0.5 ? 1 : -1;
      const lateral = side * randomRange(this.random, this.track.halfWidth + 24, this.track.halfWidth + 76);
      const { position, yaw } = this.getTrackPlacement(p, lateral);
      if (this.random() < 0.46) {
        this.addCactus(position, randomRange(this.random, 3.6, 6.8));
      } else {
        const dune = new THREE.Mesh(
          new THREE.DodecahedronGeometry(randomRange(this.random, 2.4, 6.5), 0),
          this.materials.sand,
        );
        dune.position.copy(position);
        dune.position.y = randomRange(this.random, 0.35, 0.9);
        dune.scale.set(randomRange(this.random, 2.2, 4.5), 0.28, randomRange(this.random, 1.0, 2.5));
        dune.rotation.y = yaw + randomRange(this.random, -0.8, 0.8);
        setShadow(dune);
        this.scene.add(dune);
      }
    }
  }

  addCactus(position, height) {
    const group = new THREE.Group();
    group.position.copy(position);
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.42, height, 6),
      this.materials.cactus,
    );
    trunk.position.y = height / 2;
    group.add(trunk);

    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.22, height * 0.36, 6),
        this.materials.cactus,
      );
      arm.position.set(side * 0.55, height * 0.62, 0);
      arm.rotation.z = Math.PI / 2;
      const tip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.2, height * 0.28, 6),
        this.materials.cactus,
      );
      tip.position.set(side * 0.72, height * 0.78, 0);
      group.add(arm, tip);
    }

    setShadow(group);
    this.scene.add(group);
  }

  addForestSectionProps() {
    for (let p = 0.805; p < 0.93; p += 0.01) {
      for (const side of [-1, 1]) {
        if (this.random() < 0.42) continue;
        const lateral = side * randomRange(this.random, this.track.halfWidth + 24, this.track.halfWidth + 72);
        const { position } = this.getTrackPlacement(p, lateral);
        this.addPineTree(position, randomRange(this.random, 5.5, 10.5), false);
      }
    }
  }

  addShortcutGroundMarkers() {
    const markerGeo = new THREE.BoxGeometry(2.6, 0.07, 0.42);
    const markerMats = [
      new THREE.MeshStandardMaterial({ color: 0xffca3a, roughness: 0.72, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x111820, roughness: 0.72, flatShading: true }),
    ];

    for (const zone of this.track.shortcutZones) {
      const start = zone.start - 10 / this.track.totalLength;
      for (let i = 0; i < 5; i += 1) {
        const frame = this.track.getFrameAtProgress(start + (i * 3) / this.track.totalLength);
        const stripe = new THREE.Mesh(markerGeo, markerMats[i % 2]);
        stripe.position
          .copy(frame.point)
          .addScaledVector(frame.normal, zone.side * (this.track.halfWidth - 3.2));
        stripe.position.y = 0.12;
        stripe.rotation.y = yawFromDirection(frame.tangent) + Math.PI / 2;
        stripe.receiveShadow = true;
        this.scene.add(stripe);
      }
    }
  }

  addPitLane() {
    const frame = this.track.getFrameAtProgress((this.track.finishProgress ?? 0.035) + 0.065);
    const buildingMat = new THREE.MeshStandardMaterial({ color: 0xd8d3c1, roughness: 0.78, flatShading: true });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xc94334, roughness: 0.7, flatShading: true });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x222a31, roughness: 0.55, flatShading: true });
    const pit = new THREE.Group();
    const side = this.getOuterSide(frame);
    pit.position
      .copy(frame.point)
      .addScaledVector(frame.normal, side * (this.track.halfWidth + 36));
    pit.rotation.y = yawFromDirection(frame.tangent);

    const building = new THREE.Mesh(new THREE.BoxGeometry(34, 5.2, 10), buildingMat);
    building.position.set(-6, 2.6, 0);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(37, 1.2, 12.5), roofMat);
    roof.position.set(-6, 5.7, 0);
    const door = new THREE.Mesh(new THREE.BoxGeometry(5.5, 3.2, 0.18), darkMat);
    door.position.set(-16, 1.7, 5.12);
    const timing = new THREE.Mesh(new THREE.BoxGeometry(8, 4.2, 7), buildingMat);
    timing.position.set(21, 2.1, 1.5);
    pit.add(building, roof, door, timing);

    for (let i = 0; i < 5; i += 1) {
      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 0.9),
        new THREE.MeshStandardMaterial({
          color: i % 2 === 0 ? 0xf4d63a : 0x2f66d9,
          side: THREE.DoubleSide,
          roughness: 0.7,
          flatShading: true,
        }),
      );
      flag.position.set(-16 + i * 7, 7.8, 5.6);
      flag.rotation.y = Math.PI;
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 4, 8),
        this.materials.metal,
      );
      pole.position.set(flag.position.x - 0.8, 6.2, 5.55);
      pit.add(flag, pole);
    }

    setShadow(pit);
    this.scene.add(pit);
  }

  addTrees() {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7b4f2c, roughness: 0.9, flatShading: true });
    const leafMats = [
      new THREE.MeshStandardMaterial({ color: 0x2f7f3a, roughness: 0.86, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x3c9646, roughness: 0.86, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x246e39, roughness: 0.86, flatShading: true }),
    ];

    const size = new THREE.Vector3();
    this.track.bounds.getSize(size);
    const radiusBase = Math.max(size.x, size.z) * 0.5 + 58;
    for (let i = 0; i < 86; i += 1) {
      const angle = randomRange(this.random, 0, Math.PI * 2);
      const radius = randomRange(this.random, radiusBase, radiusBase + 85);
      const x = this.track.center.x + Math.cos(angle) * radius + randomRange(this.random, -24, 24);
      const z = this.track.center.z + Math.sin(angle) * radius + randomRange(this.random, -18, 18);
      const tree = new THREE.Group();
      tree.position.set(x, 0, z);
      const h = randomRange(this.random, 5.5, 9.5);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.36, h, 5), trunkMat);
      trunk.position.y = h / 2;
      const canopy = new THREE.Mesh(
        new THREE.ConeGeometry(randomRange(this.random, 2.4, 4.2), randomRange(this.random, 5.5, 8.2), 5),
        leafMats[i % leafMats.length],
      );
      canopy.position.y = h + 2.1;
      tree.add(trunk, canopy);
      setShadow(tree);
      this.scene.add(tree);
    }
  }

  addLowPolyTerrainProps() {
    const size = new THREE.Vector3();
    this.track.bounds.getSize(size);
    const radiusBase = Math.max(size.x, size.z) * 0.5 + 36;

    for (let i = 0; i < 28; i += 1) {
      const angle = randomRange(this.random, 0, Math.PI * 2);
      const radius = randomRange(this.random, radiusBase, radiusBase + 74);
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(randomRange(this.random, 1.6, 4.8), 0),
        i % 4 === 0 ? this.materials.hill : this.materials.rock,
      );
      rock.position.set(
        this.track.center.x + Math.cos(angle) * radius,
        randomRange(this.random, 0.7, 1.8),
        this.track.center.z + Math.sin(angle) * radius,
      );
      rock.scale.set(
        randomRange(this.random, 1, 2.8),
        randomRange(this.random, 0.35, 1.1),
        randomRange(this.random, 1, 2.4),
      );
      rock.rotation.set(
        randomRange(this.random, 0, Math.PI),
        randomRange(this.random, 0, Math.PI),
        randomRange(this.random, 0, Math.PI),
      );
      setShadow(rock);
      this.scene.add(rock);
    }
  }

  addSpectatorArea() {
    const frame = this.track.getFrameAtProgress(0.18);
    const standMat = new THREE.MeshStandardMaterial({ color: 0x98a1aa, roughness: 0.65, metalness: 0.05, flatShading: true });
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x2d6cdf, roughness: 0.7, flatShading: true });
    const stand = new THREE.Group();
    const side = this.getOuterSide(frame);
    stand.position
      .copy(frame.point)
      .addScaledVector(frame.normal, side * (this.track.halfWidth + 38));
    stand.rotation.y = yawFromDirection(frame.tangent) + Math.PI;

    for (let row = 0; row < 4; row += 1) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(28, 0.35, 1.6), seatMat);
      bench.position.set(0, 0.75 + row * 0.75, row * 1.8);
      stand.add(bench);
      const base = new THREE.Mesh(new THREE.BoxGeometry(29, 0.3, 1.8), standMat);
      base.position.set(0, 0.25 + row * 0.75, row * 1.8 + 0.35);
      stand.add(base);
    }

    const railGeo = new THREE.BoxGeometry(29, 0.18, 0.18);
    const rail = new THREE.Mesh(railGeo, this.materials.metal);
    rail.position.set(0, 3.65, 7.1);
    stand.add(rail);
    setShadow(stand);
    this.scene.add(stand);
  }

  addLamps() {
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 8.5, 6);
    const lampGeo = new THREE.SphereGeometry(0.42, 8, 6);
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xfff2bc,
      emissive: 0xffd885,
      emissiveIntensity: 0.75,
      roughness: 0.25,
      flatShading: true,
    });
    for (const progress of [0.05, 0.19, 0.36, 0.49, 0.64, 0.82, 0.94]) {
      const frame = this.track.getFrameAtProgress(progress);
      const side = this.getOuterSide(frame);
      const group = new THREE.Group();
      group.position
        .copy(frame.point)
        .addScaledVector(frame.normal, side * (this.track.halfWidth + 7.5));
      const pole = new THREE.Mesh(poleGeo, this.materials.metal);
      pole.position.y = 4.25;
      const lamp = new THREE.Mesh(lampGeo, lightMat);
      lamp.position.set(0, 8.65, 0);
      group.add(pole, lamp);
      setShadow(group);
      this.scene.add(group);
    }
  }

}
