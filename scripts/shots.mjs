import { chromium } from 'playwright';
const dir = '/tmp/claude-0/-home-user-prueba/3d5d2af9-b730-5bdb-9f0c-1c74493f48c6/scratchpad/';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('pageerror', (e) => logs.push('ERR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') logs.push('CONSOLE ' + m.text()); });

const click = (sel) => page.evaluate((s) => document.querySelector(s)?.click(), sel);

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
await page.screenshot({ path: dir + 's_modes.png' });

await click('[data-act="tab"][data-id="routes"]');
await page.waitForTimeout(700);
await page.screenshot({ path: dir + 's_routes.png' });

await click('[data-act="tab"][data-id="cars"]');
await page.waitForTimeout(700);
await page.screenshot({ path: dir + 's_cars.png' });

// ── Modo tráfico ──
await click('[data-act="drive"]');
await page.waitForTimeout(1200);
await page.keyboard.down('w');

// Piloto automático mínimo: mantenerse en el carril para poder ver la ruta.
// Sin esto el auto se va al pasto en la primera curva y no se ve nada.
let held = null;
async function autopilot(ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const err = await page.evaluate(() => {
      const g = window.game, c = g.carState, hw = g.highway;
      const lane = Math.floor((hw.cfg.lanes - 1) / 2);
      return hw.laneCenter(c.posZ + 18, lane) - c.posX;
    });
    const want = err > 1.6 ? 'd' : err < -1.6 ? 'a' : null;
    if (want !== held) {
      if (held) await page.keyboard.up(held);
      if (want) await page.keyboard.down(want);
      held = want;
    }
    // Bajo SwiftShader el juego corre a ~3 FPS y cualquier corrección se
    // pasa de largo. Si el auto se cruza, la tecla de reset lo devuelve al
    // carril: alcanza para sacar una foto representativa.
    const skew = await page.evaluate(() => window.game.carState.driftAngle);
    if (skew > 0.5) await page.keyboard.press('r');
    await page.waitForTimeout(45);
  }
}
await autopilot(8000);
await page.screenshot({ path: dir + 's_traffic0.png' });
await autopilot(9000);
await page.screenshot({ path: dir + 's_traffic.png' });
const traffic = await page.evaluate(() => window.game.debug());
await autopilot(8000);
await page.screenshot({ path: dir + 's_traffic2.png' });
if (held) await page.keyboard.up(held);
await page.keyboard.up('w');

await page.evaluate(() => window.game.endRun());
await page.waitForTimeout(1400);
await page.screenshot({ path: dir + 's_traffic_results.png' });

// ── Modo drift ──
await click('[data-act="togarage"]');
await page.waitForTimeout(600);
await click('[data-act="tab"][data-id="modes"]');
await page.waitForTimeout(400);
await click('[data-act="mode"][data-id="drift"]');
await page.waitForTimeout(2500);
await click('[data-act="drive"]');
await page.waitForTimeout(1200);

await page.keyboard.down('w');
await page.waitForTimeout(12000);
await page.keyboard.down(' ');
await page.keyboard.down('d');
await page.waitForTimeout(400);
await page.keyboard.up(' ');
await page.waitForTimeout(10000);
await page.screenshot({ path: dir + 's_drift.png' });
const drift = await page.evaluate(() => window.game.debug());
await page.keyboard.up('d');
await page.waitForTimeout(700);
await page.keyboard.up('w');

await page.evaluate(() => window.game.endRun());
await page.waitForTimeout(1400);
await page.screenshot({ path: dir + 's_results.png' });

console.log('TRAFFIC', JSON.stringify(traffic, null, 1));
console.log('DRIFT', JSON.stringify(drift, null, 1));
console.log(logs.join('\n') || '(sin errores)');
await browser.close();
