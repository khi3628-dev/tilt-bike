// 헤드리스 크롬(아이폰 가로 크기)으로 실제 페이지 점검
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'));
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/frame')) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end('<iframe src="/#test" style="width:844px;height:390px;border:0"></iframe>'); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html);
});
const shots = path.join(__dirname, 'shots');
fs.mkdirSync(shots, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fails = [];
const check = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) fails.push(msg); };

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;
  const browser = await chromium.launch();
  const mk = async (w, h, opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ...opts });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    return { ctx, page, errs };
  };

  // 1) 화면 누르기로 5판 (정책은 페이지 안에서 매 16ms 각도 지정)
  console.log('[1] 화면 누르기 모드 + 5판 자동 플레이');
  {
    const { page, errs } = await mk(844, 390);
    await page.goto(base + '/#test');
    await sleep(400);
    await page.screenshot({ path: shots + '/01_title.png' });
    await page.click('#bTouch');
    await sleep(300);
    check(await page.isVisible('#ovMenu'), '목록이 뜸');
    await page.screenshot({ path: shots + '/02_menu.png' });
    const policies = {
      0: "()=>12",
      1: "()=>22",
      2: "()=>18",
      3: "(s,m)=> s.x < m.bumps.x-16 ? 20 : s.x < m.bumpsEnd.x ? Math.max(-25,Math.min(25,8*(4-s.vx))) : 15",
      4: "(s,m,z)=> s.x < m.bumps.x-16 ? 18 : s.x < m.bumpsEnd.x ? Math.max(-25,Math.min(25,8*(4-s.vx))) : s.x < m.lip.x+8 ? 25 : s.x < m.plateau.x-6 ? Math.max(-25,Math.min(25,8*(7-s.vx))) : Math.max(-25,Math.min(25,10*(Math.max(-1.5,Math.min(5,0.9*((z.x0+z.x1)/2-s.x)))-s.vx)))"
    };
    for (let i = 0; i < 5; i++) {
      await page.evaluate(([i, pol]) => {
        window.__tb.startStage(i);
        const f = eval(pol);
        clearInterval(window.__iv);
        window.__iv = setInterval(() => {
          const sim = window.__tb.sim; if (!sim) return;
          window.__tb.setAngle(f(sim.snapshot(), sim.def.t.marks, sim.def.stopZone));
        }, 16);
      }, [i, policies[i]]);
      let st;
      for (let k = 0; k < 400; k++) {
        await sleep(100);
        st = await page.evaluate(() => window.__tb.state());
        if (k === 25) await page.screenshot({ path: shots + `/1${i}_play.png` });
        if (st.overlay === 'ovResult') break;
      }
      const title = await page.textContent('#resTitle');
      check(st.overlay === 'ovResult' && st.result && st.result.ok, `${i + 1}판 성공 (${title})`);
      if (i === 4) await page.screenshot({ path: shots + '/19_result_ok.png' });
    }
    // 실패 한 번: 4판 브레이크 없이
    await page.evaluate(() => { clearInterval(window.__iv); window.__tb.setAngle(20); window.__tb.startStage(3); });
    for (let k = 0; k < 200; k++) { await sleep(100); if ((await page.evaluate(() => window.__tb.state())).overlay === 'ovResult') break; }
    const ft = await page.textContent('#resTitle');
    check(/고꾸라|바위/.test(ft), '4판 브레이크 없이 → 실패 문구: ' + ft);
    await page.screenshot({ path: shots + '/20_result_fail.png' });
    // 3판 느리게 → 틈
    await page.evaluate(() => { window.__tb.setAngle(6); window.__tb.startStage(2); });
    for (let k = 0; k < 200; k++) { await sleep(100); if ((await page.evaluate(() => window.__tb.state())).overlay === 'ovResult') break; }
    check(/틈/.test(await page.textContent('#resTitle')), '3판 느리게 → "틈에 빠졌어요"');
    // 진짜 터치: 오른쪽 누르고 있으면 앞으로 감
    await page.evaluate(() => { window.__tb.setAngle(null); window.__tb.Input.testAngle = null; window.__tb.startStage(0); });
    await page.mouse.move(800, 200); await page.mouse.down();
    await sleep(2500);
    const x1 = await page.evaluate(() => window.__tb.sim.snapshot().x);
    await page.mouse.up();
    check(x1 > 6, '화면 오른쪽 누르기 → 앞으로 감 (x=' + x1.toFixed(1) + ')');
    await page.screenshot({ path: shots + '/21_touch.png' });
    check(errs.length === 0, '페이지 오류 0' + (errs.length ? ': ' + errs.join(' | ') : ''));
  }

  // 2) 기울기 모드: iOS처럼 권한 요청 → 센서 값 흉내 → 각도 부호
  console.log('[2] 기울기 모드 (센서 흉내)');
  {
    const { page, errs } = await mk(844, 390);
    await page.addInitScript(() => { window.DeviceMotionEvent.requestPermission = () => Promise.resolve('granted'); });
    await page.goto(base + '/#test');
    await sleep(300);
    // 가로로 든 폰: 중력이 기기 x축 쪽 (값의 부호는 기기마다 다를 수 있어 0° 기준 상대각만 씀)
    await page.evaluate(() => {
      window.__g = { x: -9.5, y: 0.8, z: -2.0 };
      window.__mv = setInterval(() => window.dispatchEvent(new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: window.__g })), 16);
    });
    await page.click('#bTilt');
    await sleep(600);
    check(await page.isVisible('#ovCalib'), '권한 허용 → 0° 맞추기 화면');
    await page.screenshot({ path: shots + '/30_calib.png' });
    await page.click('#bCalibGo');
    await sleep(200);
    check(await page.isVisible('#ovMenu'), '0° 맞춘 뒤 목록');
    await page.evaluate(() => window.__tb.startStage(0));
    // 시계 방향으로 15° 돌림 = 기기 좌표에서 중력 벡터가 +15° 돎
    const rot = async (deg) => page.evaluate((deg) => {
      const a = deg * Math.PI / 180, g0 = { x: -9.5, y: 0.8 };
      window.__g = { x: g0.x * Math.cos(a) - g0.y * Math.sin(a), y: g0.x * Math.sin(a) + g0.y * Math.cos(a), z: -2.0 };
    }, deg);
    await rot(15); await sleep(800);
    let phi = await page.evaluate(() => window.__tb.state().phiDeg);
    check(Math.abs(phi - (15 - 3) * 25 / 22) < 0.6, '시계 방향 15° → 게임 +' + phi.toFixed(1) + '° (기대 13.6)');
    await sleep(2500);
    const x = await page.evaluate(() => window.__tb.sim.snapshot().x);
    check(x > 6, '기울이니 앞으로 감 (x=' + x.toFixed(1) + ')');
    await page.screenshot({ path: shots + '/31_tilt15.png' });
    await rot(2); await sleep(500);
    phi = await page.evaluate(() => window.__tb.state().phiDeg);
    check(Math.abs(phi) < 0.05, '2°는 무시 (게임 ' + phi.toFixed(2) + '°)');
    await rot(-40); await sleep(800);
    phi = await page.evaluate(() => window.__tb.state().phiDeg);
    check(Math.abs(phi + 25) < 0.05, '반대로 40° → 최대 -25° (게임 ' + phi.toFixed(1) + '°)');
    await page.screenshot({ path: shots + '/32_tiltback.png' });
    // 센서 점검 창
    await page.evaluate(() => window.__tb.openMenu());
    await page.click('#bDiag'); await sleep(300);
    const dtext = await page.textContent('#diagText');
    check(/센서 신호: \d+번/.test(dtext) && /직접 열림/.test(dtext), '센서 점검 창에 값이 나옴');
    await page.screenshot({ path: shots + '/33_diag.png' });
    check(errs.length === 0, '페이지 오류 0' + (errs.length ? ': ' + errs.join(' | ') : ''));
  }

  // 3) 권한 거절 / iframe 안
  console.log('[3] 권한 거절 · iframe');
  {
    const { page, errs } = await mk(844, 390);
    await page.addInitScript(() => { window.DeviceMotionEvent.requestPermission = () => Promise.resolve('denied'); });
    await page.goto(base + '/#test');
    await page.click('#bTilt'); await sleep(400);
    check(await page.isVisible('#ovSensorFail'), '거절 → 실패 화면');
    await page.click('#bUseTouch'); await sleep(200);
    check(await page.isVisible('#ovMenu'), '화면 누르기로 넘어감');
    check(errs.length === 0, '페이지 오류 0');
  }
  {
    const { page, errs } = await mk(900, 420);
    await page.goto(base + '/frame');
    await sleep(500);
    const fr = page.frames().find(f => f !== page.mainFrame());
    const note = await fr.textContent('#titleNote');
    check(/github\.io/.test(note), 'iframe 안 → 시작 화면에 GitHub 주소 안내');
    await fr.click('#bTilt'); await sleep(1900);
    check(await fr.isVisible('#ovSensorFail'), 'iframe 안 센서 신호 없음 → 실패 화면');
    const why = await fr.textContent('#failWhy');
    check(/github\.io/.test(why), '실패 화면에 주소 안내');
    await page.screenshot({ path: shots + '/40_iframe_fail.png' });
    check(errs.length === 0, '페이지 오류 0' + (errs.length ? ': ' + errs.join(' | ') : ''));
  }

  // 4) 세로로 들면 안내
  console.log('[4] 세로 화면');
  {
    const { page } = await mk(390, 844);
    await page.goto(base + '/#test'); await sleep(300);
    check(await page.isVisible('#ovPortrait'), '세로 → "가로로 돌려 주세요"');
    await page.screenshot({ path: shots + '/50_portrait.png' });
  }

  await browser.close(); server.close();
  console.log(fails.length ? `\n실패 ${fails.length}개` : '\n모두 통과');
  process.exit(fails.length ? 1 : 0);
})();
