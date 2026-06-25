import * as THREE from 'three';

export class SceneManager {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fd2ff);
    this.scene.fog = new THREE.Fog(0x8fd2ff, 1100, 5200);

    this.camera = new THREE.PerspectiveCamera(
      62,
      window.innerWidth / window.innerHeight,
      0.1,
      7200,
    );
    this.camera.position.set(-18, 10, -124);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.container.appendChild(this.renderer.domElement);
    this.addLights();

    window.addEventListener('resize', () => this.resize());
    this.renderer.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
    });
  }

  addLights() {
    const ambient = new THREE.HemisphereLight(0xe8f7ff, 0x587646, 1.9);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff1c7, 3.45);
    sun.position.set(-80, 130, -55);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 2600;
    sun.shadow.camera.left = -1700;
    sun.shadow.camera.right = 1700;
    sun.shadow.camera.top = 1700;
    sun.shadow.camera.bottom = -1700;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x88bfff, 0.8);
    fill.position.set(90, 70, 120);
    this.scene.add(fill);
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
