export class InputManager {
  constructor() {
    this.keys = new Set();
    this.resetRequested = false;
    this.itemUseRequested = false;
    this.cameraToggleRequested = false;
    this.debugCameraToggleRequested = false;

    window.addEventListener('keydown', (event) => this.onKeyDown(event));
    window.addEventListener('keyup', (event) => this.onKeyUp(event));
    window.addEventListener('blur', () => this.keys.clear());
  }

  isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return (
      target.isContentEditable ||
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT'
    );
  }

  onKeyDown(event) {
    if (this.isTypingTarget(event.target)) {
      this.keys.clear();
      return;
    }

    const controlCodes = [
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Space',
      'KeyE',
      'KeyF',
      'ControlLeft',
      'ControlRight',
      'ShiftLeft',
      'ShiftRight',
    ];
    if (controlCodes.includes(event.code)) event.preventDefault();
    this.keys.add(event.code);

    if (event.code === 'KeyR') this.resetRequested = true;
    if (
      event.code === 'KeyE' ||
      event.code === 'KeyF' ||
      event.code === 'ControlLeft' ||
      event.code === 'ControlRight' ||
      event.code === 'ShiftLeft' ||
      event.code === 'ShiftRight'
    ) {
      this.itemUseRequested = true;
    }
    if (event.code === 'KeyC') this.cameraToggleRequested = true;
    if (event.code === 'KeyV') this.debugCameraToggleRequested = true;
  }

  onKeyUp(event) {
    if (this.isTypingTarget(event.target)) {
      this.keys.clear();
      return;
    }
    this.keys.delete(event.code);
  }

  getControls() {
    const accelerate = this.keys.has('KeyW') || this.keys.has('ArrowUp');
    const brake = this.keys.has('KeyS') || this.keys.has('ArrowDown');
    const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft');
    const right = this.keys.has('KeyD') || this.keys.has('ArrowRight');
    return {
      throttle: accelerate ? 1 : 0,
      brake: brake ? 1 : 0,
      steer: (left ? 1 : 0) - (right ? 1 : 0),
      handbrake: this.keys.has('Space'),
    };
  }

  consumeReset() {
    const requested = this.resetRequested;
    this.resetRequested = false;
    return requested;
  }

  consumeItemUse() {
    const requested = this.itemUseRequested;
    this.itemUseRequested = false;
    return requested;
  }

  consumeCameraToggle() {
    const requested = this.cameraToggleRequested;
    this.cameraToggleRequested = false;
    return requested;
  }

  consumeDebugCameraToggle() {
    const requested = this.debugCameraToggleRequested;
    this.debugCameraToggleRequested = false;
    return requested;
  }
}
