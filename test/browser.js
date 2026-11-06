// 헤드리스 크롬 점검: PC 키보드 · 폰 터치 · 센서 흉내 · 영어판 · SDK 목업 · 잠금 · 일시정지
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { stageCount } = require('../src/core.js');

const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'));
const cgHtml = fs.readFileSync(path.join(__dirname, '../crazygames/index.html'), 'utf8').replace('<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>', '<script src="/sdkmock.js"></script>');
const polSrc = 'window.POL=(function(){const module={exports:{}};' + fs.readFileSync(path.join(__dirname, 'policies.js'), 'utf8') + ';return module.exports;})();';
const sdkMock = `
window.__cg = { calls: [], data: (function(){ try { return JSON.parse(sessionStorage.getItem('__cgdata') || '{}'); } catch (e) { return {}; } })(), muted: false, settingsListeners: [] };
window.CrazyGames = { SDK: {
  init: async () => { window.__cg.calls.push('init'); },
  get environment() { return 'local'; },
  game: { loadingStart: () => window.__cg.calls.push('loadingStart'), loadingStop: () => window.__cg.calls.push('loadingStop'),
    gameplayStart: () => window.__cg.calls.push('gameplayStart'), gameplayStop: () => window.__cg.calls.push('gameplayStop'), happytime: () => window.__cg.calls.push('happytime'),
    settings: { muteAudio: false, addEventListener: (n, cb) => window.__cg.settingsListeners.push(cb) } },
  ad: { requestAd: (type, cb) => { window.__cg.calls.push('ad:' + type); setTimeout(() => cb.adStarted(), 50); setTimeout(() => cb.adFinished(), 600); } },
  data: { getItem: async (k) => { window.__cg.calls.push('get:' + k); return window.__cg.data[k] == null ? null : window.__cg.data[k]; }, setItem: (k, v) => { window.__cg.data[k] = v; window.__cg.calls.push('set:' + k); try { sessionStorage.setItem('__cgdata', JSON.stringify(window.__cg.data)); } catch (e) { } } }
} };`;
const server = http.createServer((req, res) => {
  const u = req.url.split('#')[0];
  if (u.startsWith('/frame')) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end('<iframe src="/#test" style="width:844px;height:390px;border:0"></iframe>'); return; }
  if (u.startsWith('/cg')) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(cgHtml); return; }
  if (u.startsWith('/sdkmock.js')) { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(sdkMock); return; }
  if (u.startsWith('/img/')) { const f = path.join(__dirname, '../dist', u); if (fs.existsSync(f)) { res.writeHead(200, { 'content-type': 'image/webp' }); res.end(fs.readFileSync(f)); return; } res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html);
});
const shots = path.join(__dirname, 'shots'); fs.mkdirSync(shots, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fails = [];
const check = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) fails.push(msg); };
const HANGUL = /[ㄱ-ㆎ가-힣]/;

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;
  const browser = await chromium.launch();
  const mk = async (w, h, opts = {}, init) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, ...opts });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    page.on('requestfailed', r => { if (!r.url().includes('/img/')) errs.push('request: ' + r.url()); });
    if (init) await page.addInitScript(init);
    return { ctx, page, errs };
  };
  const waitResult = async (page, max = 600) => { let st; for (let k = 0; k < max; k++) { await sleep(100); st = await page.evaluate(() => window.__tb.state()); if (st.overlay === 'ovResult') return st; } return st; };
  const drive = (page, i, which) => page.evaluate(([i, which]) => {
    window.__tb.startStage(i);
    const sp = window.POL.STAGE_POLICIES[i];
    const f = which == null ? Object.values(sp.good)[0] : sp.bad[which][1];
    clearInterval(window.__iv);
    window.__iv = setInterval(() => {
      const sim = window.__tb.sim; if (!sim || sim.result) return;
      const g = sim.def.gates.map(x => x.zone);
      const sn = sim.snapshot();
      if (f.jump && f.jump(sn, sim.def.t.marks, sim)) sim.jump();
      window.__tb.setAngle(f(sn, sim.def.t.marks, sim.def.stopZone, g, sim));
    }, 16);
  }, [i, which]);
  const stopDrive = (page) => page.evaluate(() => { clearInterval(window.__iv); window.__tb.setAngle(null); });

  // [1] PC 키보드 모드: 15판 자동 완주 + 별 저장 + 잠금 풀림
  console.log('[1] PC · 키보드 · 15판 자동 완주');
  {
    const { page, errs } = await mk(1280, 720, { locale: 'ko-KR' }, polSrc);
    await page.goto(base + '/#test'); await sleep(500);
    check(await page.isVisible('#title'), '타이틀 화면');
    await page.screenshot({ path: shots + '/01_title.png' });
    await page.click('#title'); await sleep(300);
    const st0 = await page.evaluate(() => window.__tb.state());
    check(st0.overlay === 'ovWorlds' && (await page.evaluate(() => window.__tb.Input.mode)) === 'keys', 'PC는 바로 키보드 모드 → 세계 목록');
    await page.screenshot({ path: shots + '/02_worlds.png' });
    // 잠금: 2번 세계는 잠김
    const lockedW = await page.$$eval('#worldList .tile', els => els.map(e => e.className.includes('locked')));
    check(lockedW.join() === 'false,true,true,true,true,true', '세계 2~6 잠김');
    await page.click('#worldList .tile:nth-child(1)'); await sleep(200);
    const lockedS = await page.$$eval('#stageList .tile', els => els.map(e => e.className.includes('locked')));
    check(lockedS.join() === 'false,true,true,true,true', '1-2~1-5 잠김');
    await page.click('#stageList .tile:nth-child(2)'); await sleep(200);
    check((await page.textContent('#toast')).length > 0 && (await page.evaluate(() => window.__tb.state().overlay)) === 'ovStages', '잠긴 판 누르면 안내만');
    const starsAll = [];
    for (let i = 0; i < stageCount; i++) {
      await drive(page, i, null);
      const st = await waitResult(page);
      const title = await page.textContent('#resTitle');
      const stars = await page.$$eval('#resStars .lit', e => e.length);
      starsAll.push(stars);
      check(st.overlay === 'ovResult' && st.result && st.result.ok, `${i + 1}/${stageCount} ${await page.evaluate(() => window.__tb.sim.def.id)} 완주 (${title}, ★${stars}, ${st.result && st.result.time && st.result.time.toFixed(1)}s)`);
      if (i === 2 || i === 7 || i === 11) await page.screenshot({ path: shots + `/1${i}_result.png` });
      await stopDrive(page);
    }
    check(starsAll.every(s => s === 3), '모범 운전은 모두 ★3 (' + starsAll.join('') + ')');
    const prog = await page.evaluate(() => window.__tb.PROG);
    check(Object.keys(prog.stars).length === stageCount, '별이 ' + stageCount + '판 모두 저장됨');
    await page.evaluate(() => window.__tb.openWorlds()); await sleep(150);
    const lockedW2 = await page.$$eval('#worldList .tile', els => els.map(e => e.className.includes('locked')));
    check(lockedW2.every(v => !v), '모든 판 뒤 세계 모두 열림');
    check(new RegExp(stageCount * 3 + '/' + stageCount * 3).test(await page.textContent('#worldsStars')), '합계 ' + stageCount * 3);
    await page.screenshot({ path: shots + '/03_worlds_done.png' });
    // 새로고침 뒤 유지
    await page.reload(); await sleep(500);
    const prog2 = await page.evaluate(() => window.__tb.PROG);
    check(Object.keys(prog2.stars).length === stageCount, '새로고침 뒤 기록 유지');
    // 실패 문구들
    const failCases = [[3, 0, /바위|턱/, '1-4 브레이크 없이'], [2, 0, /틈/, '1-3 느리게'], [6, 1, /다리/, '2-2 다리 느림'], [11, 0, /차단기/, '3-2 안 멈춤'], [4, 0, /떨어졌/, '1-5 안 멈춤'], [1, 0, null, '1-2 살짝(타임아웃 아님: 뒤로 밀림 안내)']];
    for (const [i, which, re, name] of failCases) {
      await drive(page, i, which);
      if (!re) { let seen = ''; for (let k = 0; k < 34; k++) { await sleep(500); const op = await page.$eval('#toast', e => e.style.opacity); if (op === '1') { seen = await page.textContent('#toast'); break; } } check(/뒤로/.test(seen), name + ' → 토스트: ' + seen); await stopDrive(page); continue; }
      const st = await waitResult(page, 400);
      const title = await page.textContent('#resTitle');
      check(st.overlay === 'ovResult' && re.test(title), `${name} → "${title}"`);
      if (i === 11) await page.screenshot({ path: shots + '/20_fail_gate.png' });
      await stopDrive(page);
    }
    // 실제 키보드: → 누르고 있으면 전진, P로 일시정지
    await page.evaluate(() => window.__tb.startStage(0)); await sleep(100);
    await page.keyboard.down('ArrowRight'); await sleep(2500); await page.keyboard.up('ArrowRight');
    const x1 = await page.evaluate(() => window.__tb.sim.snapshot().x);
    check(x1 > 6, '→ 키로 전진 (x=' + x1.toFixed(1) + ')');
    await page.keyboard.press('p'); await sleep(150);
    check((await page.evaluate(() => window.__tb.state())).overlay === 'ovPause', 'P → 일시정지');
    await page.screenshot({ path: shots + '/21_pause.png' });
    await page.click('#bResume'); await sleep(150);
    check((await page.evaluate(() => window.__tb.state())).overlay == null && (await page.evaluate(() => window.__tb.state().playing)), '계속 → 플레이');
    // 설정: 기록 초기화 2번 누름
    await page.keyboard.press('p'); await sleep(100); await page.click('#bPSet'); await sleep(150);
    await page.screenshot({ path: shots + '/22_settings.png' });
    await page.click('#bReset'); await sleep(100); await page.click('#bReset'); await sleep(200);
    check(Object.keys(await page.evaluate(() => window.__tb.PROG.stars)).length === 0, '기록 초기화 (두 번 누름)');
    check(errs.length === 0, '페이지 오류 0' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
    await page.close();
  }

  // [2] 영어판: 화면 글·캔버스 글에 한글 0
  console.log('[2] 영어판 한글 검사');
  {
    const { page, errs } = await mk(1280, 720, { locale: 'en-US' }, polSrc + ';window.__canvasText=new Set();const _ft=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(t){window.__canvasText.add(String(t));return _ft.apply(this,arguments);};');
    await page.goto(base + '/#test'); await sleep(400);
    const texts = new Set();
    const grab = async () => { const t = await page.evaluate(() => Array.from(document.querySelectorAll('body *')).filter(e => e.children.length === 0 && e.offsetParent !== null).map(e => e.textContent.trim()).filter(Boolean)); t.forEach(x => texts.add(x)); };
    check((await page.evaluate(() => window.__tb.L.lang)) === 'en', '브라우저 en → 영어');
    await grab(); await page.click('#title'); await sleep(200); await grab();
    await page.evaluate(() => window.__tb.unlockAll()); await page.evaluate(() => window.__tb.openWorlds()); await sleep(100); await grab();
    await page.click('#worldList .tile:nth-child(3)'); await sleep(100); await grab();
    await page.evaluate(() => window.__tb.openSettings()); await sleep(100); await grab();
    for (const [i, which] of [[14, null], [3, 0], [2, 0], [6, 1], [11, 0], [4, 0], [13, null], [12, 0], [9, 2]]) { await drive(page, i, which); await waitResult(page, 700); await grab(); await stopDrive(page); }
    await page.evaluate(() => window.__tb.startStage(0)); await page.keyboard.press('p'); await sleep(100); await grab();
    await page.screenshot({ path: shots + '/30_en_pause.png' });
    const canvasTexts = await page.evaluate(() => Array.from(window.__canvasText));
    const bad = [...texts, ...canvasTexts].filter(t => HANGUL.test(t) && t !== '한' && t !== '한국어');
    check(bad.length === 0, `영어판 글 ${texts.size + canvasTexts.length}개 중 한글 ${bad.length}개` + (bad.length ? ': ' + bad.slice(0, 5).join(' / ') : ''));
    check(errs.length === 0, '페이지 오류 0' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
    await page.close();
  }

  // [3] 폰 터치 (아이폰 가로) + 세로 안내
  console.log('[3] 폰 터치');
  {
    const { page, errs } = await mk(844, 390, { isMobile: true, hasTouch: true }, polSrc);
    await page.goto(base + '/#test'); await sleep(400);
    await page.tap('#title'); await sleep(200);
    check((await page.evaluate(() => window.__tb.state())).overlay === 'ovInput', '폰은 입력 고르기 화면');
    await page.screenshot({ path: shots + '/40_input.png' });
    await page.tap('#bTouch'); await sleep(200);
    check((await page.evaluate(() => window.__tb.state())).overlay === 'ovWorlds', '화면 누르기 → 세계 목록');
    await page.evaluate(() => window.__tb.startStage(0)); await sleep(100);
    await page.mouse.move(800, 200); await page.mouse.down(); await sleep(2500); await page.mouse.up();
    const x1 = await page.evaluate(() => window.__tb.sim.snapshot().x);
    check(x1 > 6, '오른쪽 누르기 → 전진 (x=' + x1.toFixed(1) + ')');
    await page.screenshot({ path: shots + '/41_touch_play.png' });
    await page.tap('#bPause'); await sleep(150);
    check((await page.evaluate(() => window.__tb.state())).overlay === 'ovPause', '‖ → 일시정지');
    await page.evaluate(() => { window.__tb.L.set('en'); window.__tb.openSettings(); }); await sleep(100);
    await page.tap('#bDiag'); await sleep(150);
    const diagEn = await page.textContent('#diagText');
    check(!HANGUL.test(diagEn) && /Permission/.test(diagEn), '센서 점검 창 영어');
    check(errs.length === 0, '페이지 오류 0' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
    await page.close();
    const p2 = await mk(390, 844, { isMobile: true, hasTouch: true });
    await p2.page.goto(base + '/#test'); await sleep(300);
    check(await p2.page.isVisible('#ovPortrait'), '세로 → 가로 안내');
    await p2.page.tap('#bPortraitOk'); await sleep(150);
    check(!(await p2.page.isVisible('#ovPortrait')), '세로로 그냥 하기');
    await p2.page.close();
  }

  // [4] 기울기 모드 (센서 흉내)
  console.log('[4] 기울기 (센서 흉내)');
  {
    // (a) 1인칭: 0점 고정, 앞으로 숙이기 (iOS 부호: 화면이 하늘을 보면 z = -9.8)
    {
      const { page, errs } = await mk(844, 390, { isMobile: true, hasTouch: true }, 'window.DeviceMotionEvent.requestPermission = () => Promise.resolve("granted");');
      await page.goto(base + '/#test'); await sleep(300);
      await page.evaluate(() => { window.__g = { x: -9.8, y: 0, z: 0 }; window.__mv = setInterval(() => window.dispatchEvent(new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: window.__g })), 16); });
      await page.tap('#title'); await sleep(200);
      check(/앞으로 숙일수록|Lean it forward/.test(await page.textContent('#inLine2')), '1인칭 시작 안내: 앞으로 숙이기');
      await page.tap('#bTilt'); await sleep(700);
      check((await page.evaluate(() => window.__tb.state())).overlay === 'ovWorlds', '1인칭 기울기: 0° 맞추기 없이 바로 세계 목록');
      await page.evaluate(() => window.__tb.startStage(0));
      const lean = (deg) => page.evaluate((deg) => { const a = deg * Math.PI / 180; window.__g = { x: -9.8 * Math.cos(a), y: 0, z: -9.8 * Math.sin(a) }; }, deg);
      await lean(0); await sleep(600);
      let p = await page.evaluate(() => window.__tb.state().phiDeg);
      check(Math.abs(p) < 0.05, '세워 들면 0° (게임 ' + p.toFixed(2) + '°)');
      await lean(47); await sleep(700); p = await page.evaluate(() => window.__tb.state().phiDeg);
      check(Math.abs(p - (47 - 4) * 25 / 86) < 0.6, '앞으로 47° → 게임 +' + p.toFixed(1) + '° (기대 12.5)');
      await sleep(2500);
      check((await page.evaluate(() => window.__tb.sim.snapshot().x)) > 6, '숙이니 전진');
      await lean(90); await sleep(700); p = await page.evaluate(() => window.__tb.state().phiDeg);
      check(Math.abs(p - 25) < 0.3, '앞으로 90° → 최고 +25° (게임 ' + p.toFixed(1) + '°)');
      await lean(-45); await sleep(700); p = await page.evaluate(() => window.__tb.state().phiDeg);
      check(Math.abs(p + 25) < 0.3, '뒤로 45° → 브레이크 최대 -25° (게임 ' + p.toFixed(1) + '°)');
      await lean(-20); await sleep(700); p = await page.evaluate(() => window.__tb.state().phiDeg);
      check(p < -5 && p > -15, '뒤로 20° → 브레이크 ' + p.toFixed(1) + '°');
      await page.screenshot({ path: shots + '/34_fp_lean.png' });
      check(errs.length === 0, '페이지 오류 0' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
      await page.close();
    }
    // (b) 옆 시점: 핸들 돌리기 + 0° 맞추기
    const { page, errs } = await mk(844, 390, { isMobile: true, hasTouch: true }, 'window.DeviceMotionEvent.requestPermission = () => Promise.resolve("granted"); try { if (!localStorage.getItem("fixiedrop.set")) localStorage.setItem("fixiedrop.set", JSON.stringify({ view: "side" })); } catch (e) {}');
    await page.goto(base + '/#test'); await sleep(300);
    await page.evaluate(() => { window.__g = { x: -9.5, y: 0.8, z: -2.0 }; window.__mv = setInterval(() => window.dispatchEvent(new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: window.__g })), 16); });
    await page.tap('#title'); await sleep(200); await page.tap('#bTilt'); await sleep(600);
    check(await page.isVisible('#ovCalib'), '권한 허용 → 0° 맞추기');
    await page.tap('#bCalibGo'); await sleep(200);
    check((await page.evaluate(() => window.__tb.state())).overlay === 'ovWorlds', '0° 맞춘 뒤 세계 목록');
    await page.evaluate(() => window.__tb.startStage(0));
    const rot = (deg) => page.evaluate((deg) => { const a = deg * Math.PI / 180, g0 = { x: -9.5, y: 0.8 }; window.__g = { x: g0.x * Math.cos(a) - g0.y * Math.sin(a), y: g0.x * Math.sin(a) + g0.y * Math.cos(a), z: -2.0 }; }, deg);
    await rot(15); await sleep(800);
    let phi = await page.evaluate(() => window.__tb.state().phiDeg);
    check(Math.abs(phi - (15 - 3) * 25 / 22) < 0.6, '시계 방향 15° → 게임 +' + phi.toFixed(1) + '°');
    await sleep(2500);
    check((await page.evaluate(() => window.__tb.sim.snapshot().x)) > 6, '기울이니 전진');
    await rot(2); await sleep(500); phi = await page.evaluate(() => window.__tb.state().phiDeg);
    check(Math.abs(phi) < 0.05, '2° 무시');
    await rot(-40); await sleep(800); phi = await page.evaluate(() => window.__tb.state().phiDeg);
    check(Math.abs(phi + 25) < 0.05, '반대 40° → -25°');
    // 다시 열면 바로 기울기 (권한 재요청)
    await page.reload(); await sleep(400);
    await page.evaluate(() => { window.__g = { x: -9.5, y: 0.8, z: -2.0 }; setInterval(() => window.dispatchEvent(new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: window.__g })), 16); });
    await page.tap('#title'); await sleep(700);
    check(await page.isVisible('#ovCalib'), '다시 열면 저장된 기울기 모드로 바로 0° 맞추기');
    check(errs.length === 0, '페이지 오류 0' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
    await page.close();
    // 거절
    const p3 = await mk(844, 390, { isMobile: true, hasTouch: true }, 'window.DeviceMotionEvent.requestPermission = () => Promise.resolve("denied");');
    await p3.page.goto(base + '/#test'); await sleep(300); await p3.page.tap('#title'); await sleep(200); await p3.page.tap('#bTilt'); await sleep(400);
    check(await p3.page.isVisible('#ovSensorFail'), '거절 → 실패 화면');
    await p3.page.tap('#bUseTouch'); await sleep(200);
    check((await p3.page.evaluate(() => window.__tb.state())).overlay === 'ovWorlds', '→ 화면 누르기');
    await p3.page.close();
    // iframe
    const p4 = await mk(900, 420, { isMobile: true, hasTouch: true, locale: 'ko-KR' });
    await p4.page.goto(base + '/frame'); await sleep(500);
    const fr = p4.page.frames().find(f => f !== p4.page.mainFrame());
    await fr.click('#title'); await sleep(200);
    check(/막혀/.test(await fr.textContent('#inNote')), 'iframe 안 → 센서 막힘 안내');
    await p4.page.close();
  }

  // [5] CrazyGames SDK 목업
  console.log('[5] CrazyGames SDK 흐름');
  {
    const { page, errs } = await mk(1280, 720, { locale: 'ko-KR' }, polSrc);
    await page.goto(base + '/cg#test'); await sleep(600);
    let calls = await page.evaluate(() => window.__cg.calls);
    check(calls.slice(0, 3).join(',') === 'init,loadingStart,get:fixiedrop.prog' && calls.includes('loadingStop') && calls.indexOf('loadingStop') > calls.indexOf('get:fixiedrop.prog'), 'init → loadingStart → 저장 읽기 → loadingStop: ' + calls.join(','));
    check(calls.includes('set:fixiedrop.prog'), '계정 저장 없음 → 이 브라우저 기록 올림');
    await page.click('#title'); await sleep(200);
    await page.evaluate(() => { window.__cg.calls.length = 0; });
    await drive(page, 0, null); await waitResult(page);
    calls = await page.evaluate(() => window.__cg.calls);
    check(calls[0] === 'gameplayStart' && calls.includes('gameplayStop') && calls.includes('happytime') && calls.includes('set:fixiedrop.prog'), '판 시작 gameplayStart → 결과 gameplayStop + 첫 ★3 happytime + 저장: ' + calls.join(','));
    await stopDrive(page);
    await page.evaluate(() => { window.__cg.calls.length = 0; });
    await page.click('#bNext'); await sleep(200);
    check(await page.isVisible('#adCover'), '다음 → 광고 덮개');
    check((await page.evaluate(() => window.__tb.A.get('muted'))) === true, '광고 중 소리 0');
    await sleep(700);
    const st = await page.evaluate(() => window.__tb.state());
    calls = await page.evaluate(() => window.__cg.calls);
    check(!(await page.isVisible('#adCover')) && st.playing && st.stage === 1 && calls[0] === 'ad:midgame', '광고 끝 → 2판 시작, 소리 복귀: ' + calls.join(','));
    check((await page.evaluate(() => window.__tb.A.get('muted'))) === false, '광고 뒤 소리 복귀');
    // 설정 음소거
    await page.evaluate(() => window.__cg.settingsListeners.forEach(cb => cb({ data: { muteAudio: true } })));
    check((await page.evaluate(() => window.__tb.A.get('muted'))) === true, 'SDK 음소거 설정 따름');
    // 계정 저장 복원
    await page.evaluate(() => { window.__cg.data['fixiedrop.prog'] = JSON.stringify({ stars: { 0: 3, 1: 2, 2: 1 }, best: {} }); sessionStorage.setItem('__cgdata', JSON.stringify(window.__cg.data)); try { localStorage.clear(); } catch (e) { } });
    await page.reload(); await sleep(600);
    const prog = await page.evaluate(() => window.__tb.PROG);
    check(prog.stars[2] === 1 && prog.stars[1] === 2, '계정 저장이 있으면 그걸로 복원');
    check(errs.length === 0, '페이지 오류 0' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
    await page.close();
  }

  await browser.close(); server.close();
  console.log(fails.length ? `\n실패 ${fails.length}개` : '\n모두 통과');
  process.exit(fails.length ? 1 : 0);
})();
