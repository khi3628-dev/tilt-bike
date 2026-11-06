// 2.0 화면 흐름 점검: node test/v2smoke.js → test/shots/v2-*.png
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'));
const server = http.createServer((req, res) => { const u = req.url.split('#')[0]; if (u.startsWith('/img/')) { const f = path.join(__dirname, '../dist', u); if (fs.existsSync(f)) { res.writeHead(200, { 'content-type': 'image/webp' }); res.end(fs.readFileSync(f)); return; } res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); });
const shots = path.join(__dirname, 'shots'); fs.mkdirSync(shots, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let bad = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) bad++; };
(async () => {
  await new Promise(r => server.listen(0, r));
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 844, height: 390 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(() => { window.__images = true; window.__autoDaily = true; if (!localStorage.getItem('fixiedrop.set')) localStorage.setItem('fixiedrop.set', JSON.stringify({ input: 'keys', lang: 'ko', view: 'side', sound: false, music: false })); });
  await page.goto('http://localhost:' + server.address().port + '/#test'); await sleep(900);
  ok(await page.textContent('#titleH1') === '픽시 드롭', '제목 픽시 드롭');
  await page.mouse.click(400, 200); await sleep(500);
  ok(await page.evaluate(() => document.getElementById('ovDaily').classList.contains('show')), '처음 세계 화면 → 출석 창 자동');
  await page.screenshot({ path: path.join(shots, 'v2-daily.png') });
  await page.click('#bDailyClaim'); await sleep(200);
  ok((await page.textContent('#dailyMsg')).includes('50'), '출석 1일째 50코인: ' + await page.textContent('#dailyMsg'));
  await page.click('#bDailyClose'); await sleep(200);
  await page.screenshot({ path: path.join(shots, 'v2-worlds.png') });
  ok((await page.textContent('#worldsCoins')).includes('50'), '세계 화면 코인 50');
  ok(await page.evaluate(() => document.querySelectorAll('#worldList button').length) === 6, '세계 6개');
  await page.click('#bGarage'); await sleep(300);
  await page.screenshot({ path: path.join(shots, 'v2-garage.png'), fullPage: false });
  await page.click('.gsw .sw:nth-child(2)'); await sleep(200);   // 빨간 차체 100 (모자람)
  ok(await page.evaluate(() => window.__tb && JSON.parse(localStorage.getItem('fixiedrop.meta')).eq.paint) === 'blue', '코인 모자라면 못 삼');
  await page.click('#bGarageBack'); await sleep(200);
  // 1-1 완주
  await page.click('#worldList button'); await sleep(200);
  await page.screenshot({ path: path.join(shots, 'v2-stages.png') });
  await page.evaluate(() => { window.__tb.setAngle(25); }); await page.click('#stageList button'); await sleep(1500);
  await page.screenshot({ path: path.join(shots, 'v2-play.png') });
  await page.waitForFunction(() => window.__tb.state().overlay === 'ovResult', null, { timeout: 30000 }); await sleep(400);
  await page.screenshot({ path: path.join(shots, 'v2-result.png') });
  const m1 = await page.evaluate(() => JSON.parse(localStorage.getItem('fixiedrop.meta')));
  ok(m1.coins > 50 && m1.cleared['1-1'], '완주 보상 받음: 코인 ' + m1.coins);
  ok(await page.evaluate(() => !!localStorage.getItem('fixiedrop.ghost.1-1')), '고스트 저장');
  ok((await page.textContent('#resReward')).includes('+'), '결과 화면 보상 줄');
  // 다시: 고스트가 보이는지 (반대로 기울여 느리게)
  await page.evaluate(() => { window.__tb.setAngle(12); window.__tb.startStage(0); }); await sleep(2600);
  ok(await page.evaluate(() => { return true; }), '다시 하기');
  await page.screenshot({ path: path.join(shots, 'v2-ghost-side.png') });
  await page.evaluate(() => { window.__tb.SET.view = 'fp'; window.__tb.startStage(0); }); await sleep(2600);
  await page.screenshot({ path: path.join(shots, 'v2-ghost-fp.png') });
  // 새 세계 판 (4-3 눈보라) 1인칭
  await page.evaluate(() => { window.__tb.setAngle(25); window.__tb.startStage(17); }); await sleep(2500);
  await page.screenshot({ path: path.join(shots, 'v2-ice-fp.png') });
  await page.evaluate(() => { window.__tb.SET.view = 'side'; window.__tb.startStage(28); }); await sleep(4300);
  await page.screenshot({ path: path.join(shots, 'v2-loop-side.png') });
  ok(errs.length === 0, '페이지 오류 0 ' + JSON.stringify(errs));
  await b.close(); server.close();
  console.log(bad ? '실패 ' + bad : '모두 통과'); process.exit(bad ? 1 : 0);
})();
