import { chromium } from 'playwright';

const URL = process.argv[2] ?? 'http://localhost:4173/';
const SHOT = process.argv[3] ?? '/tmp/claude-0/-home-user-prueba/3d5d2af9-b730-5bdb-9f0c-1c74493f48c6/scratchpad/shot.png';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
    '--disable-dev-shm-usage',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack ?? ''}`));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Arrancar un run
const started = await page.evaluate(() => {
  document.getElementById('boot-go')?.click();
  const btn = document.querySelector('[data-act="drive"], [data-act="claim"]');
  if (btn) { btn.click(); return btn.dataset.act; }
  return null;
});
await page.waitForTimeout(600);
await page.evaluate(() => {
  const btn = document.querySelector('[data-act="drive"]');
  if (btn) btn.click();
});
await page.waitForTimeout(1200);

// Manejar: acelerar, girar, handbrake
await page.keyboard.down('w');
await page.waitForTimeout(2500);
await page.keyboard.down('d');
await page.keyboard.down(' ');
await page.waitForTimeout(700);
await page.keyboard.up(' ');
await page.waitForTimeout(2500);
await page.keyboard.up('d');
await page.waitForTimeout(1500);

const state = await page.evaluate(() => (window.game ? window.game.debug() : null));

// Sonda: qué objetos hay bajo el auto en pantalla
const probe = await page.evaluate(() => {
  const g = window.game;
  if (!g) return null;
  const r = g.renderer ?? g._renderer;
  return null;
});

// Medir FPS
const fps = await page.evaluate(() => new Promise((res) => {
  let frames = 0;
  const t0 = performance.now();
  const tick = () => {
    frames++;
    if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
    else res(Math.round((frames * 1000) / (performance.now() - t0)));
  };
  requestAnimationFrame(tick);
}));

await page.keyboard.up('w');
await page.screenshot({ path: SHOT });

console.log('--- estado ---');
console.log(JSON.stringify(state, null, 2));
console.log('fps (swiftshader, software):', fps);
console.log('first button:', started);
console.log('--- consola ---');
console.log(logs.slice(0, 40).join('\n') || '(sin mensajes)');

await browser.close();
