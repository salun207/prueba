import { chromium } from 'playwright';
const dir = '/tmp/claude-0/-home-user-prueba/3d5d2af9-b730-5bdb-9f0c-1c74493f48c6/scratchpad/';
const car = process.argv[2] || 'kite_240';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('ERR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ' + m.text()); });
await page.goto(`http://127.0.0.1:5173/dev-car.html?car=${car}${process.argv[3] ? '&mode=' + process.argv[3] : ''}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
for (let i = 0; i < 4; i++) {
  await page.evaluate((n) => window.shot(n), i);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${dir}car_${car}_${process.argv[3] || 'lit'}_${i}.png` });
}
const rows = await page.evaluate(() => window.info());
for (const r of rows) {
  console.log(
    r.mat.padEnd(34),
    'pos', JSON.stringify(r.pos).padEnd(20),
    'bbox', JSON.stringify(r.bbox).padEnd(40),
    'tris', r.tris,
  );
}
await browser.close();
