const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'));
const polSrc = 'window.POL=(function(){const module={exports:{}};' + fs.readFileSync(path.join(__dirname, 'policies.js'), 'utf8') + ';return module.exports;})();';
const server = http.createServer((q, r) => { const u = q.url.split('#')[0]; if (u.startsWith('/img/')) { const f = path.join(__dirname, '../dist', u); if (fs.existsSync(f)) { r.writeHead(200, { 'content-type': 'image/webp' }); r.end(fs.readFileSync(f)); return; } r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch();
  const out = [];
  for (const [tag, mobile, stage, ang] of [['fp', true, 2, 6], ['side', false, 2, 6], ['fpcliff', true, 4, -1]]) {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, locale: 'ko-KR' });
    const page = await ctx.newPage(); await page.addInitScript(polSrc + ';window.__images=true;');
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto('http://localhost:' + server.address().port + '/#test'); await sleep(500);
    console.log(tag, 'view =', await page.evaluate(() => window.__tb.SET.view));
    await page.evaluate(([s, a]) => { window.__tb.unlockAll(); window.__tb.Input.mode = 'touch'; window.__tb.startStage(s);
      if (a >= 0) window.__tb.setAngle(a);
      else { const f = window.POL.STAGE_POLICIES[s].bad[0][1]; window.__iv = setInterval(() => { const sim = window.__tb.sim; if (!sim || sim.result) return; window.__tb.setAngle(f(sim.snapshot(), sim.def.t.marks, sim.def.stopZone, sim.def.gates.map(g => g.zone))); }, 16); } }, [stage, ang]);
    let t0 = null; const marks = [0.15, 0.6, 1.1];
    for (let k = 0; k < 2200; k++) {
      await sleep(20);
      const st = await page.evaluate(() => ({ r: window.__tb.sim.result, ov: window.__tb.state().overlay }));
      if (st.r && t0 == null) { t0 = Date.now(); console.log(tag, 'result', JSON.stringify(st.r)); }
      if (t0 != null) {
        const el = (Date.now() - t0) / 1000;
        if (marks.length && el >= marks[0]) { const m = marks.shift(); const f = `test/shots/fall_${tag}_${m}.png`; await page.screenshot({ path: f }); out.push(f); }
        if (st.ov === 'ovResult') { const f = `test/shots/fall_${tag}_result.png`; await page.screenshot({ path: f }); out.push(f); console.log(tag, 'result card after', ((Date.now() - t0) / 1000).toFixed(1), 's'); break; }
      }
    }
    console.log(tag, 'errors', errs.length, errs.slice(0, 2));
    await ctx.close();
  }
  fs.writeFileSync('/tmp/fallshots.json', JSON.stringify(out));
  await browser.close(); server.close();
})();
