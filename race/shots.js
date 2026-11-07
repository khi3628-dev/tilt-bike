// 레이스 화면 점검: node race/shots.js → test/shots/race-*.png
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../dist/race.html'));
const server = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shots = path.join(__dirname, '../test/shots'); fs.mkdirSync(shots, { recursive: true });
let bad = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) bad++; };
(async () => {
  await new Promise(r => server.listen(0, r));
  const b = await chromium.launch();
  for (const [name, vp] of [['pc', { viewport: { width: 1280, height: 720 } }], ['phone', { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true }]]) {
    const page = await (await b.newContext(Object.assign({ locale: 'ko-KR' }, vp))).newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto('http://localhost:' + server.address().port + '/'); await sleep(700);
    await page.screenshot({ path: path.join(shots, 'race-' + name + '-start.png') });
    await page.evaluate(() => window.__race.setSeed(5));
    if (name === 'phone') await page.tap('#bStart'); else await page.click('#bStart');
    await sleep(1500); await page.screenshot({ path: path.join(shots, 'race-' + name + '-count.png') });
    await sleep(2200);
    // 조작: 왼쪽 누르고 있으면 왼쪽으로
    const y0 = await page.evaluate(() => window.__race.race.riders[0].b.getPosition().y);
    if (name === 'phone') { await page.evaluate(() => { window.__race.touch.L = true; }); await sleep(700); await page.evaluate(() => { window.__race.touch.L = false; }); }
    else { await page.keyboard.down('ArrowLeft'); await sleep(700); await page.keyboard.up('ArrowLeft'); }
    const y1 = await page.evaluate(() => window.__race.race.riders[0].b.getPosition().y);
    ok(y1 < y0 - 1, name + ' 왼쪽 누르면 왼쪽으로 (' + y0.toFixed(1) + ' → ' + y1.toFixed(1) + ')');
    await sleep(3500); await page.screenshot({ path: path.join(shots, 'race-' + name + '-run.png') });
    // 오른쪽 벽으로 붙여 긁기
    if (name === 'pc') { await page.keyboard.down('ArrowRight'); await sleep(2500); await page.screenshot({ path: path.join(shots, 'race-pc-wall.png') }); await page.keyboard.up('ArrowRight'); }
    await page.waitForFunction(() => document.getElementById('ovResult').classList.contains('show'), null, { timeout: 60000 });
    await sleep(300); await page.screenshot({ path: path.join(shots, 'race-' + name + '-result.png') });
    const rows = await page.$$eval('#rTable tr', e => e.length);
    ok(rows === 5, name + ' 결과표 5명');
    ok(errs.length === 0, name + ' 페이지 오류 0 ' + JSON.stringify(errs));
  }
  await b.close(); server.close(); console.log(bad ? '실패 ' + bad : '모두 통과'); process.exit(bad ? 1 : 0);
})();
