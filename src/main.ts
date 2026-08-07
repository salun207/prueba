import './style.css';
import { Game } from './Game';

const gameCanvas = document.getElementById('game') as HTMLCanvasElement;
const hudCanvas = document.getElementById('hud') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;

try {
  const game = new Game(gameCanvas, hudCanvas, uiRoot);
  (window as unknown as { game: Game }).game = game;
} catch (err) {
  console.error(err);
  uiRoot.classList.add('active');
  uiRoot.innerHTML = `
    <div class="screen modal">
      <h1>NO ARRANCÓ</h1>
      <p>${err instanceof Error ? err.message : String(err)}</p>
      <p class="hint">Necesitás un navegador con WebGL2.</p>
    </div>`;
}
