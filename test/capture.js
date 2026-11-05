// 장면 캡처: 판별로 bike가 특정 x에 왔을 때
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'));
const server = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  await page.goto('http://localhost:' + server.address().port + '/#test');
  await page.click('#bTouch'); await sleep(200);
  const jobs = [
    [2, "()=>18", "m.lip.x+3", 'c_jump'],
    [3, "(s,m)=> s.x < m.bumps.x-16 ? 20 : Math.max(-25,Math.min(25,8*(4-s.vx)))", "m.bumps.x+6", 'c_tunnel'],
    [4, "(s,m,z)=> s.x < m.bumps.x-16 ? 18 : s.x < m.bumpsEnd.x ? Math.max(-25,Math.min(25,8*(4-s.vx))) : s.x < m.lip.x+8 ? 25 : s.x < m.plateau.x-6 ? Math.max(-25,Math.min(25,8*(7-s.vx))) : Math.max(-25,Math.min(25,10*(Math.max(-1.5,Math.min(5,0.9*((z.x0+z.x1)/2-s.x)))-s.vx)))", "z.x0", 'c_stop'],
    [1, "()=>22", "m.hill.x+4", 'c_hill'],
  ];
  for (const [i, pol, at, name] of jobs) {
    await page.evaluate(([i, pol]) => {
      window.__tb.startStage(i); const f = eval(pol); clearInterval(window.__iv);
      window.__iv = setInterval(() => { const sim = window.__tb.sim; window.__tb.setAngle(f(sim.snapshot(), sim.def.t.marks, sim.def.stopZone)); }, 16);
    }, [i, pol]);
    for (let k = 0; k < 600; k++) {
      await sleep(30);
      const ok = await page.evaluate((at) => { const sim = window.__tb.sim, m = sim.def.t.marks, z = sim.def.stopZone; return sim.snapshot().x >= eval(at); }, at);
      if (ok) break;
    }
    await page.screenshot({ path: path.join(__dirname, 'shots', name + '.png') });
  }
  await browser.close(); server.close();
})();
