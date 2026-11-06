// 장면 캡처 (PC 1280×720 + 폰 844×390)
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'));
const polSrc = 'window.POL=(function(){const module={exports:{}};' + fs.readFileSync(path.join(__dirname, 'policies.js'), 'utf8') + ';return module.exports;})();';
const server = http.createServer((q, r) => { const u = q.url.split('#')[0]; if (u.startsWith('/img/')) { const f = path.join(__dirname, '../dist', u); if (fs.existsSync(f)) { r.writeHead(200, { 'content-type': 'image/webp' }); r.end(fs.readFileSync(f)); return; } r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = path.join(__dirname, 'shots');
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch();
  const jobs = [
    [5, 'm.lip2.x+2', 'c_w2_doublejump'], [6, 'm.b0.x+4', 'c_w2_bridge'], [8, 'm.bottom.x-4', 'c_w2_steep'],
    [10, 'm.w0.x+8', 'c_w3_headwind'], [11, 'm.z0.x+2', 'c_w3_gate'], [12, 'm.w0.x+6', 'c_w3_tailwind'], [14, 'z.x0-2', 'c_w3_summit'],
    [3, 'm.bumps.x+6', 'c_w1_tunnel']
  ];
  for (const [vw, vh, tag, mobile] of [[1280, 720, 'pc', false], [844, 390, 'ph', true]]) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: 'ko-KR' });
    const page = await ctx.newPage(); await page.addInitScript(polSrc + ';window.__images=true;');
    await page.goto('http://localhost:' + server.address().port + '/#test'); await sleep(800);
    await page.screenshot({ path: `${out}/${tag}_title.png` });
    await page.evaluate(() => { window.__tb.unlockAll(); window.__tb.Input.mode = 'keys'; window.__tb.openWorlds(); }); await sleep(200);
    await page.screenshot({ path: `${out}/${tag}_worlds.png` });
    await page.evaluate(() => window.__tb.openStages(1)); await sleep(200);
    await page.screenshot({ path: `${out}/${tag}_stages.png` });
    for (const [i, at, name] of jobs) {
      await page.evaluate((i) => { window.__tb.startStage(i); const f = Object.values(window.POL.STAGE_POLICIES[i].good)[0]; clearInterval(window.__iv); window.__iv = setInterval(() => { const sim = window.__tb.sim; if (!sim || sim.result) return; window.__tb.setAngle(f(sim.snapshot(), sim.def.t.marks, sim.def.stopZone, sim.def.gates.map(g => g.zone))); }, 16); }, i);
      for (let k = 0; k < 900; k++) { await sleep(30); const ok = await page.evaluate((at) => { const sim = window.__tb.sim, m = sim.def.t.marks, z = sim.def.stopZone; return sim.result || sim.snapshot().x >= eval(at); }, at); if (ok) break; }
      await page.screenshot({ path: `${out}/${tag}_${name}.png` });
    }
    // 기울인 상태(배경이 반대로 돌아가는지)
    await page.evaluate(() => { clearInterval(window.__iv); window.__tb.startStage(0); window.__tb.setAngle(22); });
    await sleep(1500); await page.screenshot({ path: `${out}/${tag}_tilted.png` });
    await page.evaluate(() => { window.__tb.setAngle(null); });
    await ctx.close();
  }
  await browser.close(); server.close();
})();
