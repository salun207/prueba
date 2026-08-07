/**
 * Empaqueta el build de Vite en un único HTML autocontenido.
 * Sirve para publicarlo donde no se pueda servir una carpeta con assets.
 *
 *   npm run build && node scripts/build-single.mjs
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ASSETS = 'dist/assets';
const OUT = 'dist-single/neon-apex.html';

const files = readdirSync(ASSETS);
const jsFile = files.find((f) => f.endsWith('.js'));
const cssFile = files.find((f) => f.endsWith('.css'));
if (!jsFile || !cssFile) throw new Error('Faltan los assets: corré `npm run build` primero.');

const js = readFileSync(join(ASSETS, jsFile), 'utf8');
const css = readFileSync(join(ASSETS, cssFile), 'utf8');

if (js.includes('</script')) throw new Error('El bundle contiene </script y rompería el HTML.');

const html = `<title>NEON APEX — drift arcade</title>
<style>
${css}
/* El juego se queda con todo el viewport y pinta su propio fondo: es una
   pantalla arcade nocturna, de tema único a propósito. */
html, body { margin: 0; padding: 0; background: #0b0d14; }
#app { position: fixed; inset: 0; overflow: hidden; }
#boot {
  position: absolute; inset: 0; z-index: 40; display: flex;
  flex-direction: column; align-items: center; justify-content: center; gap: 14px;
  background: #0b0d14; color: #e8ecf5;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  transition: opacity 0.4s ease;
}
#boot h1 {
  margin: 0; font-size: clamp(30px, 7vw, 58px); font-weight: 900; letter-spacing: 0.18em;
  color: #22e1ff; text-shadow: 0 0 34px rgba(34, 225, 255, 0.45);
}
#boot p { margin: 0; color: #9aa3b5; font-size: 14px; letter-spacing: 0.02em; text-align: center; }
#boot kbd {
  background: #1c2130; border: 1px solid #2a3145; border-radius: 5px;
  padding: 2px 7px; font-size: 12.5px; color: #e8ecf5; font-family: inherit;
}
#boot button {
  margin-top: 8px; padding: 14px 34px; border: none; border-radius: 10px;
  background: linear-gradient(135deg, #22e1ff, #0aa8d8); color: #04141c;
  font: 900 16px/1 system-ui, sans-serif; letter-spacing: 0.08em; cursor: pointer;
  box-shadow: 0 0 28px rgba(34, 225, 255, 0.35);
}
#boot button:focus-visible { outline: 3px solid #ff2e88; outline-offset: 3px; }
#boot.gone { opacity: 0; pointer-events: none; }
@media (prefers-reduced-motion: reduce) { #boot { transition: none; } }
</style>

<div id="app">
  <canvas id="game"></canvas>
  <canvas id="hud"></canvas>
  <div id="ui"></div>
  <div id="rotate-warning">Girá el dispositivo &#8635;</div>
  <div id="boot">
    <h1>NEON APEX</h1>
    <p>
      <kbd>W</kbd> acelerar &nbsp; <kbd>S</kbd> frenar &nbsp; <kbd>A</kbd><kbd>D</kbd> girar
      &nbsp; <kbd>Espacio</kbd> freno de mano<br />
      <kbd>R</kbd> reset &nbsp; <kbd>C</kbd> cámara &nbsp; <kbd>Esc</kbd> pausa
    </p>
    <p>En celular: mitad de abajo — izquierda freno de mano, centro volante, derecha acelerador.</p>
    <button id="boot-go" type="button">ENTRAR AL GARAGE</button>
  </div>
</div>

<script type="module">
${js}
</script>
<script>
(function () {
  var boot = document.getElementById('boot');
  var go = document.getElementById('boot-go');
  go.addEventListener('click', function () {
    boot.classList.add('gone');
    setTimeout(function () { boot.remove(); }, 450);
    window.focus();
  });
  // Las flechas y el espacio no tienen que scrollear la página que nos contiene.
  window.addEventListener('keydown', function (e) {
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.key) >= 0) {
      e.preventDefault();
    }
  }, { passive: false });
})();
</script>
`;

mkdirSync('dist-single', { recursive: true });
writeFileSync(OUT, html);
console.log(`${OUT} — ${Math.round(html.length / 1024)} KB`);
