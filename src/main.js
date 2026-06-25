import { Game } from './core/Game.js';

function showRuntimeError(message) {
  let panel = document.querySelector('[data-runtime-error]');
  if (!panel) {
    panel = document.createElement('pre');
    panel.dataset.runtimeError = 'true';
    panel.style.cssText = [
      'position:fixed',
      'left:16px',
      'right:16px',
      'bottom:58px',
      'z-index:9999',
      'max-height:34vh',
      'overflow:auto',
      'padding:12px',
      'border-radius:8px',
      'background:rgba(120,0,0,.88)',
      'color:white',
      'font:12px/1.4 monospace',
      'white-space:pre-wrap',
      'pointer-events:none',
    ].join(';');
    document.body.appendChild(panel);
  }
  panel.textContent = message;
}

window.addEventListener('error', (event) => {
  showRuntimeError(`${event.message}\n${event.filename}:${event.lineno}:${event.colno}`);
});
window.addEventListener('unhandledrejection', (event) => {
  showRuntimeError(event.reason?.stack ?? String(event.reason));
});

const game = new Game(document.getElementById('app'));
window.kartingGame = game;
game.start();
