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

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
await page.screenshot({ path: dir + 's_garage.png' });
await page.evaluate(() => document.querySelector('[data-act="tab"][data-id="cars"]')?.click());
await page.waitForTimeout(700);
await page.screenshot({ path: dir + 's_cars.png' });

await page.evaluate(() => document.querySelector('[data-act="drive"]')?.click());
await page.waitForTimeout(1200);

// Recta larga para agarrar velocidad, después un drift corto y contravolante
// El spawn mira a la rotonda, 200 m al norte: llegamos y drifteamos ahí,
// que es el único lugar abierto y sin paredes cerca.
await page.keyboard.down('w');
await page.waitForTimeout(12000);
await page.keyboard.down(' ');
await page.keyboard.down('d');
await page.waitForTimeout(400);
await page.keyboard.up(' ');
await page.waitForTimeout(12000);
await page.screenshot({ path: dir + 's_drift.png' });
const mid = await page.evaluate(() => window.game.debug());
await page.keyboard.up('d');
await page.waitForTimeout(900);
await page.keyboard.up('w');

// Forzar el final del run para ver la pantalla de resultados
await page.evaluate(() => window.game.endRun());
await page.waitForTimeout(1400);
await page.screenshot({ path: dir + 's_results.png' });

console.log(JSON.stringify(mid, null, 1));
console.log(logs.join('\n') || '(sin errores)');
await browser.close();
