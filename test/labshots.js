// 실험실 화면 캡처: node test/labshots.js → test/shots/lab-*.png
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../dist/lab.html'));
const server = http.createServer((req, res) => {
  const u = req.url.split('#')[0];
  if (u.startsWith('/img/')) { const f = path.join(__dirname, '../dist', u); if (fs.existsSync(f)) { res.writeHead(200, { 'content-type': 'image/webp' }); res.end(fs.readFileSync(f)); return; } res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html);
});
const shots = path.join(__dirname, 'shots'); fs.mkdirSync(shots, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
// [판, 시점, 기울기, 찍을 조건(x 또는 함수 문자열), 이름]
const CASES = [
  [0, 'side', 25, 'm.i0.x+10', 'ice-side'], [0, 'fp', 25, 'm.i0.x+12', 'ice-fp'],
  [1, 'side', 20, 'm.r0.x+8', 'rock-side'], [1, 'fp', 20, 'm.r0.x+8', 'rock-fp'],
  [2, 'side', 25, 'm.m0.x+8', 'mud-side'], [2, 'fp', 25, 'm.m0.x+12', 'mud-fp'],
  [3, 'side', 18, 'm.b1.x-6', 'jump-side'], [3, 'fp', 18, 'm.b1.x-7', 'jump-fp'],
  [4, 'side', 25, 'm.lip.x+5', 'drop-side'], [4, 'fp', 25, 'm.lip.x+2', 'drop-fp'],
  [5, 'side', 20, 'm.kick.x-8', 'fog-side'], [5, 'fp', 20, 'm.kick.x-8', 'fog-fp'],
  [6, 'side', 20, '30', 'rain-side'], [6, 'fp', 20, '30', 'rain-fp'],
  [7, 'side', 20, 'm.w0.x+12', 'gust-side'], [7, 'fp', 20, 'm.w0.x+12', 'gust-fp'],
  [8, 'side', 25, 'TOP', 'loop-side'], [8, 'fp', 25, 'TOP', 'loop-fp'], [8, 'fp', 25, 'm.loop.x-14', 'loop-fp-approach'], [8, 'fp', 25, 'UP', 'loop-fp-up']
];
(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(() => { window.__images = true; localStorage.setItem('tiltlab.set', JSON.stringify({ input: 'keys', lang: 'ko', view: 'side', sound: false, music: false })); });
  await page.goto(base + '/#test'); await sleep(1200);
  for (const [i, view, ang, cond, name] of CASES) {
    await page.evaluate(([i, view, ang]) => { const t = window.__tb; t.SET.view = view; t.Input.mode = 'keys'; t.setAngle(ang); t.startStage(i); }, [i, view, ang]);
    const ok = await page.evaluate(async (cond) => {
      const t = window.__tb, sim = t.sim, m = sim.def.t.marks;
      const test = () => { const p = sim.chassis.getPosition(), L = sim.loops[0];
        if (cond === 'TOP') return L && p.y > L.y1 - 1.6 && Math.abs(p.x - L.xTop) < 1.2;
        if (cond === 'UP') return L && p.x > L.x1 - 1.2 && p.y > L.y0 + 2.2 && !sim.loops[0].passed;
        return p.x > eval(cond); };
      const t0 = performance.now();
      while (!test()) { if (sim.result || performance.now() - t0 > 25000) return false; await new Promise(r => setTimeout(r, 16)); }
      return true;
    }, cond);
    await page.screenshot({ path: path.join(shots, 'lab-' + name + '.png') });
    const st = await page.evaluate(() => { const s = window.__tb.sim; return { x: +s.chassis.getPosition().x.toFixed(1), v: +s.speed().toFixed(1), res: s.result }; });
    console.log((ok ? '✓ ' : '✗ ') + name, JSON.stringify(st));
  }
  // 점프: 스페이스로 실제 점프되는지
  await page.evaluate(() => { const t = window.__tb; t.SET.view = 'side'; t.setAngle(18); t.startStage(3); });
  await page.waitForFunction(() => { const s = window.__tb.sim; return s.chassis.getPosition().x > s.def.t.marks.b1.x - 2.2; }, null, { timeout: 20000 });
  await page.keyboard.press('Space'); await sleep(250);
  const air = await page.evaluate(() => window.__tb.sim.grounded());
  await page.screenshot({ path: path.join(shots, 'lab-jump-air.png') });
  console.log((air === 0 ? '✓' : '✗') + ' 스페이스 점프 → 공중', air);
  // 실험실 목록
  await page.evaluate(() => { window.__tb.setAngle(null); window.__tb.openWorlds(); }); await sleep(300);
  await page.screenshot({ path: path.join(shots, 'lab-worlds.png') });
  await page.evaluate(() => window.__tb.openStages(0)); await sleep(300);
  await page.screenshot({ path: path.join(shots, 'lab-stages.png') });
  console.log('페이지 오류', errs.length ? errs : 0);
  await browser.close(); server.close();
})();
