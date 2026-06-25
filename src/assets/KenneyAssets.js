import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const modelCache = new Map();
const assetBase = `${import.meta.env.BASE_URL ?? '/'}`.endsWith('/')
  ? `${import.meta.env.BASE_URL ?? '/'}`
  : `${import.meta.env.BASE_URL ?? '/'}/`;

function kenneyUrl(...segments) {
  return `${assetBase}assets-kenny/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`;
}

export const KENNEY_ASSETS = {
  car: {
    kart: kenneyUrl('kenney_car-kit', 'Models', 'GLB format', 'kart-oobi.glb'),
    race: kenneyUrl('kenney_car-kit', 'Models', 'GLB format', 'race.glb'),
    raceFuture: kenneyUrl('kenney_car-kit', 'Models', 'GLB format', 'race-future.glb'),
    box: kenneyUrl('kenney_car-kit', 'Models', 'GLB format', 'box.glb'),
    cone: kenneyUrl('kenney_car-kit', 'Models', 'GLB format', 'cone.glb'),
    tire: kenneyUrl('kenney_car-kit', 'Models', 'GLB format', 'debris-tire.glb'),
    taxi: kenneyUrl('kenney_car-kit', 'Models', 'GLB format', 'taxi.glb'),
    truck: kenneyUrl('kenney_car-kit', 'Models', 'GLB format', 'truck.glb'),
    van: kenneyUrl('kenney_car-kit', 'Models', 'GLB format', 'van.glb'),
  },
  roads: {
    straight: kenneyUrl('kenney_city-kit-roads', 'Models', 'GLB format', 'road-straight.glb'),
    straightBarrier: kenneyUrl('kenney_city-kit-roads', 'Models', 'GLB format', 'road-straight-barrier.glb'),
    crossing: kenneyUrl('kenney_city-kit-roads', 'Models', 'GLB format', 'road-crossing.glb'),
    bridge: kenneyUrl('kenney_city-kit-roads', 'Models', 'GLB format', 'road-bridge.glb'),
    constructionBarrier: kenneyUrl('kenney_city-kit-roads', 'Models', 'GLB format', 'construction-barrier.glb'),
    constructionCone: kenneyUrl('kenney_city-kit-roads', 'Models', 'GLB format', 'construction-cone.glb'),
    lightCurved: kenneyUrl('kenney_city-kit-roads', 'Models', 'GLB format', 'light-curved.glb'),
    lightSquareDouble: kenneyUrl('kenney_city-kit-roads', 'Models', 'GLB format', 'light-square-double.glb'),
    signHighway: kenneyUrl('kenney_city-kit-roads', 'Models', 'GLB format', 'sign-highway-wide.glb'),
  },
  commercial: {
    buildingA: kenneyUrl('kenney_city-kit-commercial_2.1', 'Models', 'GLB format', 'building-a.glb'),
    buildingC: kenneyUrl('kenney_city-kit-commercial_2.1', 'Models', 'GLB format', 'building-c.glb'),
    buildingH: kenneyUrl('kenney_city-kit-commercial_2.1', 'Models', 'GLB format', 'building-h.glb'),
    buildingK: kenneyUrl('kenney_city-kit-commercial_2.1', 'Models', 'GLB format', 'building-k.glb'),
    buildingN: kenneyUrl('kenney_city-kit-commercial_2.1', 'Models', 'GLB format', 'building-n.glb'),
    awning: kenneyUrl('kenney_city-kit-commercial_2.1', 'Models', 'GLB format', 'detail-awning-wide.glb'),
    parasol: kenneyUrl('kenney_city-kit-commercial_2.1', 'Models', 'GLB format', 'detail-parasol-a.glb'),
  },
  suburban: {
    houseA: kenneyUrl('kenney_city-kit-suburban_20', 'Models', 'GLB format', 'building-type-a.glb'),
    houseD: kenneyUrl('kenney_city-kit-suburban_20', 'Models', 'GLB format', 'building-type-d.glb'),
    houseK: kenneyUrl('kenney_city-kit-suburban_20', 'Models', 'GLB format', 'building-type-k.glb'),
    fence: kenneyUrl('kenney_city-kit-suburban_20', 'Models', 'GLB format', 'fence-3x3.glb'),
    planter: kenneyUrl('kenney_city-kit-suburban_20', 'Models', 'GLB format', 'planter.glb'),
    treeLarge: kenneyUrl('kenney_city-kit-suburban_20', 'Models', 'GLB format', 'tree-large.glb'),
    treeSmall: kenneyUrl('kenney_city-kit-suburban_20', 'Models', 'GLB format', 'tree-small.glb'),
  },
  holiday: {
    treeSnowA: kenneyUrl('kenney_holiday-kit', 'Models', 'GLB format', 'tree-snow-a.glb'),
    treeSnowB: kenneyUrl('kenney_holiday-kit', 'Models', 'GLB format', 'tree-snow-b.glb'),
    snowman: kenneyUrl('kenney_holiday-kit', 'Models', 'GLB format', 'snowman.glb'),
    cabinWall: kenneyUrl('kenney_holiday-kit', 'Models', 'GLB format', 'cabin-wall-roof.glb'),
    cabinRoof: kenneyUrl('kenney_holiday-kit', 'Models', 'GLB format', 'cabin-roof-snow.glb'),
    bench: kenneyUrl('kenney_holiday-kit', 'Models', 'GLB format', 'bench.glb'),
    lantern: kenneyUrl('kenney_holiday-kit', 'Models', 'GLB format', 'lantern.glb'),
    present: kenneyUrl('kenney_holiday-kit', 'Models', 'GLB format', 'present-a-cube.glb'),
  },
  survival: {
    barrel: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'barrel.glb'),
    barrelOpen: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'barrel-open.glb'),
    bedroll: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'bedroll.glb'),
    bedrollPacked: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'bedroll-packed.glb'),
    bottle: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'bottle.glb'),
    bottleLarge: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'bottle-large.glb'),
    box: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'box.glb'),
    boxOpen: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'box-open.glb'),
    boxLarge: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'box-large.glb'),
    bucket: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'bucket.glb'),
    campfirePit: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'campfire-pit.glb'),
    campfireStand: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'campfire-stand.glb'),
    chest: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'chest.glb'),
    fence: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'fence.glb'),
    fenceDoorway: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'fence-doorway.glb'),
    fenceFortified: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'fence-fortified.glb'),
    floorOld: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'floor-old.glb'),
    grass: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'grass.glb'),
    grassLarge: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'grass-large.glb'),
    metalPanel: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'metal-panel.glb'),
    metalPanelNarrow: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'metal-panel-narrow.glb'),
    metalPanelScrews: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'metal-panel-screws.glb'),
    patchGrass: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'patch-grass.glb'),
    patchGrassLarge: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'patch-grass-large.glb'),
    resourcePlanks: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'resource-planks.glb'),
    resourceStone: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'resource-stone.glb'),
    resourceStoneLarge: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'resource-stone-large.glb'),
    resourceWood: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'resource-wood.glb'),
    rockA: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'rock-a.glb'),
    rockB: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'rock-b.glb'),
    rockC: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'rock-c.glb'),
    rockFlat: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'rock-flat.glb'),
    rockFlatGrass: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'rock-flat-grass.glb'),
    rockSandA: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'rock-sand-a.glb'),
    rockSandB: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'rock-sand-b.glb'),
    rockSandC: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'rock-sand-c.glb'),
    signpost: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'signpost.glb'),
    signpostSingle: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'signpost-single.glb'),
    structure: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'structure.glb'),
    structureCanvas: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'structure-canvas.glb'),
    structureMetal: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'structure-metal.glb'),
    structureMetalWall: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'structure-metal-wall.glb'),
    structureRoof: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'structure-roof.glb'),
    tent: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'tent.glb'),
    tentCanvas: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'tent-canvas.glb'),
    tentCanvasHalf: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'tent-canvas-half.glb'),
    tree: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'tree.glb'),
    treeAutumn: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'tree-autumn.glb'),
    treeAutumnTall: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'tree-autumn-tall.glb'),
    treeAutumnTrunk: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'tree-autumn-trunk.glb'),
    treeLog: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'tree-log.glb'),
    treeLogSmall: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'tree-log-small.glb'),
    treeTall: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'tree-tall.glb'),
    treeTrunk: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'tree-trunk.glb'),
    workbench: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'workbench.glb'),
    workbenchAnvil: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'workbench-anvil.glb'),
    workbenchGrind: kenneyUrl('kenney_survival-kit', 'Models', 'GLB format', 'workbench-grind.glb'),
  },
};

function setShadow(object, cast = true, receive = true) {
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = cast;
      child.receiveShadow = receive;
    }
  });
}

function cloneMaterial(material, options) {
  const clone = material.clone();
  if (clone.color && options.tint != null) {
    const color = new THREE.Color(options.tint);
    const hsl = {};
    clone.color.getHSL(hsl);
    const isDark = hsl.l < 0.12;
    const isSolidTintCandidate = hsl.l > (options.solidTintDarkCutoff ?? 0.2);
    const isLight = hsl.l > 0.86;
    const isGray = hsl.s < 0.14;
    const strength = options.solidTint && isSolidTintCandidate
      ? 1
      : isDark
      ? (options.darkTintStrength ?? 0.02)
      : isLight
        ? (options.lightTintStrength ?? options.neutralTintStrength ?? 0.18)
        : isGray
          ? (options.neutralTintStrength ?? 0.1)
          : (options.tintStrength ?? 0.72);
    clone.color.lerp(color, strength);
    if (options.solidTint && isSolidTintCandidate) {
      clone.map = null;
      clone.roughness = Math.min(clone.roughness ?? 0.55, 0.58);
    }
  }
  if ('flatShading' in clone) {
    clone.flatShading = true;
    clone.needsUpdate = true;
  }
  return clone;
}

function prepareClone(object, options) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = options.castShadow ?? true;
    child.receiveShadow = options.receiveShadow ?? true;
    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) => cloneMaterial(material, options));
    } else if (child.material) {
      child.material = cloneMaterial(child.material, options);
    }
  });
}

function fitScaleFor(size, options) {
  if (options.fitHeight) return options.fitHeight / Math.max(size.y, 0.0001);
  if (options.fitLength) return options.fitLength / Math.max(size.x, size.z, 0.0001);
  if (options.fitWidth) return options.fitWidth / Math.max(size.x, 0.0001);
  return options.scale ?? 1;
}

export function loadKenneyModel(url) {
  if (!modelCache.has(url)) {
    modelCache.set(
      url,
      new Promise((resolve, reject) => {
        loader.load(
          url,
          (gltf) => {
            const scene = gltf.scene;
            setShadow(scene);
            resolve(scene);
          },
          undefined,
          reject,
        );
      }),
    );
  }
  return modelCache.get(url);
}

export function createKenneyModel(url, options = {}) {
  const root = new THREE.Group();
  root.name = options.name ?? `Kenney_${url.split('/').at(-1)}`;
  root.rotation.y = options.rotationY ?? 0;
  if (options.position) root.position.copy(options.position);
  if (options.offset) root.position.add(options.offset);

  loadKenneyModel(url)
    .then((template) => {
      const model = template.clone(true);
      prepareClone(model, options);

      const box = new THREE.Box3().setFromObject(model);
      if (box.isEmpty()) return;

      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -box.min.y, -center.z);

      const pivot = new THREE.Group();
      pivot.add(model);
      pivot.scale.setScalar(fitScaleFor(size, options));
      if (options.localOffset) pivot.position.copy(options.localOffset);
      root.add(pivot);
      root.userData.ready = true;
      if (typeof options.onReady === 'function') options.onReady(root, pivot, size);
    })
    .catch((error) => {
      root.userData.loadError = error;
      console.warn(`Unable to load Kenney model: ${url}`, error);
    });

  return root;
}
