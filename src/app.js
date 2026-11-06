// 기울기 자전거 — 화면·입력·진행
(function () {
  const C = window.TiltCore, L = window.I18N, A = window.Audio2, CG = window.CG;
  const DEG = Math.PI / 180;
  const PAGES_URL = 'https://khi3628-dev.github.io/tilt-bike/';
  const DEAD = 3, MAXD = 25;
  const FP_DEAD = 4, FP_FWD_MAX = 90, FP_BACK_MAX = 45;   // 1인칭 앞뒤 숙이기: 앞 90°·뒤 45°에서 최대
  const IOS = (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') || /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const $ = id => document.getElementById(id);
  const inFrame = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
  const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  const hasMotion = typeof DeviceMotionEvent !== 'undefined';
  const TEST = location.hash === '#test';
  const IMG = {};                            // 그림 (있으면 씀)
  const LAB = C.IS_LAB ? window.Lab : null;   // [실험실] 효과 실험판에서만 있음
  const PFX = LAB ? 'tiltlab.' : 'tiltbike.';

  // ---------- 저장 ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(PFX + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(PFX + k, JSON.stringify(v)); } catch (e) { } CG.dataSet(PFX + k, JSON.stringify(v)); }
  };
  const SET = Object.assign({ sound: true, music: true, vib: true, input: null, invert: false, lang: null, view: null }, store.get('set', {}));
  let PROG = Object.assign({ stars: {}, best: {} }, store.get('prog', {}));
  if (SET.view !== 'fp' && SET.view !== 'side') SET.view = isTouchDevice ? 'fp' : 'side';   // 폰 = 1인칭, PC = 옆(3인칭) 추천
  const saveSet = () => store.set('set', SET);
  const saveProg = () => store.set('prog', PROG);

  // ---------- 언어 ----------
  L.set(SET.lang || ((navigator.language || 'en').toLowerCase().startsWith('ko') ? 'ko' : 'en'));
  const T = k => L.t(k);
  function applyTexts() {
    document.documentElement.lang = L.lang;
    document.title = T('title');
    $('titleH1').textContent = T('title'); $('tapToStart').textContent = T('tapToStart');
    $('inTitle').textContent = T('title'); $('inLine1').innerHTML = T(SET.view === 'side' ? 'introLine1' : 'introFP1'); $('inLine2').innerHTML = T(SET.view === 'side' ? 'introLine2' : 'introFP2');
    $('bTilt').textContent = T('startTilt'); $('bTouch').textContent = T('startTouch');
    $('sfTitle').textContent = T('sensorFailTitle'); $('bRetryTilt').textContent = T('retry'); $('bUseTouch').textContent = T('useTouch');
    $('calTitle').textContent = T('calibTitle'); $('calText').innerHTML = T('calibText'); $('bCalibGo').textContent = T('calibGo');
    $('worldsTitle').textContent = T('worlds'); $('bWorldsBack').textContent = T('back'); $('bWorldsSet').textContent = T('settings');
    $('stagesTitle').textContent = T('stages'); $('bStagesBack').textContent = T('back'); $('stagesNote').textContent = T('stars3');
    $('pauseTitle').textContent = T('pause'); $('bResume').textContent = T('resume'); $('bPRestart').textContent = T('restart'); $('bPList').textContent = T('toList'); $('bPSet').textContent = T('settings');
    $('bAgain').textContent = T('again'); $('bList').textContent = T('toList');
    $('setTitle').textContent = T('settings'); $('bSetBack').textContent = T('back');
    $('lblSound').textContent = T('sound'); $('lblMusic').textContent = T('music'); $('lblVib').textContent = T('vibrate'); $('lblInput').textContent = T('inputLabel'); $('lblLang').textContent = T('language'); $('lblView').textContent = T('view');
    $('bRecalib').textContent = T('recalib'); $('bDiag').textContent = T('diag'); $('bReset').textContent = T('resetProgress');
    $('diagTitle').textContent = T('diag'); $('diagHelp').textContent = T('diagHelp'); $('bDiagCalib').textContent = T('recalib'); $('bDiagClose').textContent = T('close');
    $('rotTitle').textContent = T('rotateTitle'); $('rotText').innerHTML = T('rotateText'); $('bPortraitOk').textContent = T('rotateAnyway');
    $('adText').textContent = T('ad'); $('cover').textContent = T('loading');
    $('bLang').textContent = L.lang === 'ko' ? 'EN' : '한';
    $('thL').textContent = Input.mode === 'keys' ? T('keyHintL') : T('touchHintL'); $('thR').textContent = Input.mode === 'keys' ? T('keyHintR') : T('touchHintR');
  }

  // ---------- 입력 ----------
  const Input = {
    mode: null,              // 'tilt' | 'touch' | 'keys'
    perm: '-', events: 0, rateN: 0, rateT: 0, rate: 0,
    g: null, g0: null, raw: 0, smooth: 0,
    touchX: null, touchAngle: 0, keyL: false, keyR: false, testAngle: null,
    onMotion(e) {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null) return;
      Input.g = { x: a.x, y: a.y, z: a.z };
      const now = performance.now();
      Input.events++; Input.rateN++;
      if (now - Input.rateT > 1000) { Input.rate = Input.rateN * 1000 / (now - Input.rateT); Input.rateN = 0; Input.rateT = now; }
    },
    calibrate() { if (this.g) { this.g0 = { x: this.g.x, y: this.g.y }; this.smooth = 0; this.raw = 0; } },
    rawDeg() {
      const g = this.g, g0 = this.g0;
      if (!g || !g0) return 0;
      const m = Math.hypot(g.x, g.y), m0 = Math.hypot(g0.x, g0.y);
      if (m < 2 || m0 < 2) return this.raw;
      const a = Math.atan2(g0.x * g.y - g0.y * g.x, g0.x * g.x + g0.y * g.y) / DEG;
      return SET.invert ? -a : a;
    },
    gameDeg(r) { const s = Math.sign(r), m = Math.abs(r); return s * Math.min(MAXD, Math.max(0, m - DEAD) * MAXD / (MAXD - DEAD)); },
    // 1인칭: 0점 고정. 폰을 세워 화면이 나를 보면 0°, 앞으로 숙여 화면이 하늘을 보면 +90°
    rawP: 0, smoothP: 0,
    pitchDeg() {
      const g = this.g;
      if (!g || g.z == null) return 0;
      const m = Math.hypot(g.x, g.y, g.z);
      if (m < 3) return this.rawP;
      let s = g.z / m;
      if (IOS) s = -s;                       // iOS Safari는 중력 값 부호가 반대 (확인 필요 — 틀리면 '방향 반대로')
      if (SET.invert) s = -s;
      return Math.asin(Math.max(-1, Math.min(1, s))) / DEG;
    },
    pitchGame(p) {
      const m = Math.abs(p), lim = p > 0 ? FP_FWD_MAX : FP_BACK_MAX;
      if (m < FP_DEAD) return 0;
      return Math.sign(p) * Math.min(MAXD, (m - FP_DEAD) * MAXD / (lim - FP_DEAD));
    },
    update(dt) {
      if (this.testAngle != null) return this.testAngle;
      if (this.mode === 'tilt' && SET.view !== 'side') {
        this.rawP = this.pitchDeg();
        this.smoothP += (this.rawP - this.smoothP) * (1 - Math.exp(-dt / 0.06));
        return this.pitchGame(this.smoothP);
      }
      if (this.mode === 'tilt') {
        this.raw = this.rawDeg();
        this.smooth += (this.raw - this.smooth) * (1 - Math.exp(-dt / 0.06));
        return this.gameDeg(this.smooth);
      }
      let target = 0;
      if (this.touchX != null) { const w = window.innerWidth; target = Math.max(-1, Math.min(1, (this.touchX - w / 2) / (w * 0.32))) * MAXD; }
      if (this.keyR) target = MAXD;
      if (this.keyL) target = -MAXD;
      const rate = (this.touchX == null && !this.keyL && !this.keyR) ? 140 : 90;
      const d = target - this.touchAngle;
      this.touchAngle += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
      return this.touchAngle;
    }
  };

  async function enableTilt() {
    let p = null;
    try { if (hasMotion && typeof DeviceMotionEvent.requestPermission === 'function') p = DeviceMotionEvent.requestPermission(); }
    catch (e) { Input.perm = 'error: ' + e.message; return sensorFail('perm'); }
    window.removeEventListener('devicemotion', Input.onMotion);
    window.addEventListener('devicemotion', Input.onMotion);
    if (p) {
      try { const r = await p; Input.perm = r; if (r !== 'granted') return sensorFail('denied'); }
      catch (e) { Input.perm = 'error: ' + (e && e.message || e); return sensorFail('perm'); }
    } else Input.perm = hasMotion ? 'n/a' : 'no sensor';
    const t0 = performance.now(), n0 = Input.events;
    while (performance.now() - t0 < 1500 && Input.events === n0) await new Promise(r => setTimeout(r, 60));
    if (Input.events === n0) return sensorFail('silent');
    Input.mode = 'tilt'; SET.input = 'tilt'; saveSet();
    Input.calibrate();                       // 옆 시점으로 바꿀 때를 위한 기준
    if (SET.view !== 'side') { applyTexts(); openWorlds(); return; }
    show('ovCalib');
  }
  function sensorFail(why) {
    let html = { denied: T('sensorDenied'), perm: T('sensorPermErr'), silent: T('sensorSilent') }[why] || '';
    if (inFrame) html = '<span class="warn">' + T('sensorFrame') + '</span><br>' + (PAGES_URL ? '<a href="' + PAGES_URL + '" target="_blank" rel="noopener">' + PAGES_URL + '</a>' : T('sensorUseTouch'));
    else if (location.protocol !== 'https:' && location.hostname !== 'localhost') html += '<br><span class="warn">' + T('httpsNote') + '</span>';
    $('failWhy').innerHTML = html;
    $('failDiag').textContent = diagLines().join('\n');
    show('ovSensorFail');
  }
  function useTouch() { Input.mode = isTouchDevice ? 'touch' : 'keys'; SET.input = Input.mode; saveSet(); applyTexts(); openWorlds(); }

  // ---------- 화면 전환 ----------
  const OVS = ['ovInput', 'ovSensorFail', 'ovCalib', 'ovWorlds', 'ovStages', 'ovPause', 'ovResult', 'ovSettings', 'ovDiag'];
  function show(id) { for (const o of OVS) $(o).classList.toggle('show', o === id); $('title').classList.toggle('show', id === 'title'); }
  function anyOverlay() { return OVS.some(o => $(o).classList.contains('show')) || $('title').classList.contains('show') || $('adCover').classList.contains('show'); }
  function current() { return OVS.find(o => $(o).classList.contains('show')) || ($('title').classList.contains('show') ? 'title' : null); }

  // ---------- 진행 ----------
  const worldOf = i => C.STAGES[i]().world;
  const stageIdxOfWorld = w => [...Array(C.stageCount).keys()].filter(i => worldOf(i) === w);
  const starsOf = i => PROG.stars[i] || 0;
  const totalStars = () => Object.values(PROG.stars).reduce((a, b) => a + b, 0);
  const unlocked = i => LAB || (TEST && window.__unlockAll) ? true : (i === 0 || starsOf(i - 1) > 0);
  const worldUnlocked = w => unlocked(stageIdxOfWorld(w)[0]);
  const worldStars = w => stageIdxOfWorld(w).reduce((a, i) => a + starsOf(i), 0);

  // ---------- 게임 상태 ----------
  let sim = null, stageIdx = 0, playing = false, endT = 0, phiDeg = 0, hintTimer = 0, toastOn = false, demo = false, paused = false;
  let lastFinishTime = 0;
  const view = { x: 0, y: 0, s: 40, shake: 0 };
  const THEMES = [
    { sky0: '#6fbfee', sky1: '#d9f1ff', far: '#a9c8dc', near: '#9ccaa5', dirt: '#a77a4e', dirt2: '#8a6240', grass: '#4caf50', grass2: '#7fd67f', rock: '#6d5f57', rock2: '#4a3f39', sun: 'rgba(255,246,190,.95)' },
    { sky0: '#f3a05a', sky1: '#ffe2b8', far: '#c9825a', near: '#e0a46e', dirt: '#b8683a', dirt2: '#8f4e2a', grass: '#d9994f', grass2: '#f0c27a', rock: '#7a4a33', rock2: '#55301f', sun: 'rgba(255,230,170,.95)' },
    { sky0: '#3b4f78', sky1: '#9db4d6', far: '#5c6f94', near: '#8ea4c4', dirt: '#6f7f99', dirt2: '#4f5d75', grass: '#e9f1fa', grass2: '#ffffff', rock: '#4c5566', rock2: '#2f3642', sun: 'rgba(230,236,255,.8)' }
  ];
  const themeIdx = () => sim ? (sim.def.theme != null ? sim.def.theme : sim.def.world) : 0;
  const curTheme = () => THEMES[themeIdx()];

  function startStage(i, opts) {
    if (playing && !demo) CG.gameplayStop();   // 플레이 중 다시 하기: 먼저 끝냈다고 알림
    stageIdx = i;
    fall = null;
    sim = new C.Sim(i);
    playing = true; paused = false; endT = 0; demo = !!(opts && opts.demo);
    if (LAB) { LAB.reset(sim); LAB.jumpButton(!demo && !!sim.def.jump && isTouchDevice, doJump); }
    const snap = sim.snapshot();
    view.x = snap.x + 2; view.y = snap.y + 1;
    if (!demo) {
      $('hud').style.display = 'flex';
      const wn = L.pick(C.WORLDS[sim.def.world].name);
      $('stageLabel').innerHTML = '<span class="w">' + sim.def.id + '</span> ' + L.pick(sim.def.name);
      setHint(L.pick(sim.def.hint), 5);
      setToast(null);
      const th = Input.mode !== 'tilt';
      $('touchhint').style.opacity = th ? 1 : 0;
      if (th) setTimeout(() => { $('touchhint').style.opacity = 0; }, 6000);
      show(null);
      A.music(themeIdx());
      CG.gameplayStart();
    }
  }
  function doJump() { if (sim && playing && !paused && sim.def.jump && !sim.rail && !anyOverlay()) sim.jump(); }   // 루프 레일 위에서는 점프 안 함
  function setHint(text, sec) { $('hint').textContent = text; $('hint').style.opacity = 1; hintTimer = sec; }
  function setToast(text, sec) { toastOn = !!text; if (text) $('toast').textContent = text; $('toast').style.opacity = text ? 1 : 0; if (text && sec) setTimeout(() => { if ($('toast').textContent === text) setToast(null); }, sec * 1000); }
  function vibrate(ms) { if (SET.vib && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { } } }

  function openTitle() {
    if (LAB) LAB.jumpButton(false);
    playing = false; $('hud').style.display = 'none'; $('touchhint').style.opacity = 0;
    A.music(null); A.quiet();
    show('title');
    startStage(0, { demo: true });
  }
  function openWorlds() {
    if (LAB) LAB.jumpButton(false);
    playing = false; paused = false; $('hud').style.display = 'none'; $('touchhint').style.opacity = 0; A.quiet();
    CG.gameplayStop();
    const Lst = $('worldList'); Lst.innerHTML = '';
    C.WORLDS.forEach((w, wi) => {
      const b = document.createElement('button');
      const un = worldUnlocked(wi), ws = worldStars(wi), max = stageIdxOfWorld(wi).length * 3;
      b.className = 'tile world' + (un ? (ws === max ? ' done' : '') : ' locked');
      b.innerHTML = '<span class="n">' + (un ? (LAB ? '🧪' : ['🏡', '🏜️', '🏔️'][wi]) : '🔒') + '</span><span class="wn">' + L.pick(w.name) + '</span><span class="ws">' + (un ? '★ ' + ws + '/' + max : T('locked')) + '</span>';
      b.onclick = () => { A.SFX.click(); if (!un) { setToast(T('lockedWorldToast'), 2); return; } openStages(wi); };
      Lst.appendChild(b);
    });
    $('worldsStars').textContent = '★ ' + totalStars() + '/' + (C.stageCount * 3);
    show('ovWorlds');
  }
  let curWorld = 0;
  function openStages(w) {
    if (LAB) LAB.jumpButton(false);
    curWorld = w; playing = false; paused = false; $('hud').style.display = 'none'; $('touchhint').style.opacity = 0; A.quiet();
    CG.gameplayStop();
    const Lst = $('stageList'); Lst.innerHTML = '';
    for (const i of stageIdxOfWorld(w)) {
      const d = C.STAGES[i](); const un = unlocked(i), st = starsOf(i);
      const b = document.createElement('button');
      b.className = 'tile' + (un ? (st ? ' done' : '') : ' locked');
      b.innerHTML = '<span class="n">' + (un ? (d.icon || d.id.split('-')[1]) : '🔒') + '</span>' + L.pick(d.name) + '<span class="stars">' + (st ? '★'.repeat(st) + '☆'.repeat(3 - st) : '') + '</span>';
      b.onclick = () => { A.SFX.click(); if (!un) { setToast(T('lockedToast'), 2); return; } startStage(i); };
      Lst.appendChild(b);
    }
    $('stagesTitle').textContent = L.pick(C.WORLDS[w].name);
    $('stagesStars').textContent = '★ ' + worldStars(w) + '/' + (stageIdxOfWorld(w).length * 3);
    show('ovStages');
  }

  function zoneOf(x) { const t = sim.def.tunnel; return t && x > t[0] && x < t[1] ? 'tunnel' : null; }
  function finish() {
    const r = sim.result;
    playing = false;
    CG.gameplayStop();
    A.quiet();
    const last = stageIdx === C.stageCount - 1;
    if (r.ok) {
      const t = r.time, st = C.stars(stageIdx, t), prev = starsOf(stageIdx);
      const best = PROG.best[stageIdx];
      const isBest = best == null || t < best;
      if (isBest) PROG.best[stageIdx] = +t.toFixed(2);
      if (st > prev) PROG.stars[stageIdx] = st;
      saveProg();
      if (st === 3 && prev < 3) CG.happytime();
      $('resIcon').textContent = last && st ? '🏆' : '🏁';
      $('resTitle').textContent = last && totalStars() >= C.stageCount ? T('allClear') : (sim.def.stopZone ? T('finishedStop') : T('finished'));
      $('resStars').innerHTML = [0, 1, 2].map(k => '<span class="' + (k < st ? 'lit' : '') + '" style="display:inline-block">★</span>').join('');
      $('resNums').innerHTML = '<span>' + T('time') + ' <b>' + t.toFixed(1) + 's</b>' + (isBest && best != null ? ' · ' + T('newBest') : '') + '</span>' + (C.PAR[stageIdx] != null ? '<span>' + T('par') + ' <b>' + C.PAR[stageIdx].toFixed(1) + 's</b></span>' : '');
      $('resText').textContent = last ? T('allClearText') : '';
      $('bNext').textContent = T('next'); $('bNext').style.display = last ? 'none' : '';
      A.SFX.finish(); vibrate([30, 40, 30]);
      let k = 0; const iv = setInterval(() => { if (k < st) { A.SFX.star(k); } k++; if (k >= 3) clearInterval(iv); }, 220);
    } else {
      const x = r.x != null ? r.x : sim.chassis.getPosition().x;
      let icon = '💥', title = T('failCrash'), text = T('failCrashText');
      if (r.kind === 'gap') {
        const onBridge = sim.def.bridges.some(b => x > b.x0 - 1 && x < b.x1 + 1);
        if (onBridge) { icon = '🪵'; title = T('failBridge'); text = T('failBridgeText'); }
        else { icon = '🕳️'; title = T('failGap'); text = T('failGapText'); }
      }
      else if (r.kind === 'cliff') { icon = '🪂'; title = T('failCliff'); text = T('failCliffText'); }
      else if (r.kind === 'ceil') { icon = '🪨'; title = T('failCeil'); text = T('failCeilText'); }
      else if (r.kind === 'gate') { icon = '🚧'; title = T('failGate'); text = T('failGateText'); }
      else if (zoneOf(x) === 'tunnel') { icon = '🐢'; title = T('failTunnel'); text = T('failTunnelText'); }
      else if (r.speed > 6) { title = T('failFast'); text = T('failFastText'); }
      $('resIcon').textContent = icon; $('resTitle').textContent = title; $('resText').textContent = text;
      $('resStars').innerHTML = ''; $('resNums').innerHTML = '';
      $('bNext').style.display = 'none';
      A.SFX.fail();
    }
    show('ovResult');
  }

  // 광고 → 다음 동작
  function withAd(then) {
    if (!CG.active()) { then(); return; }
    let started = false;
    CG.midgame(() => { started = true; $('adCover').classList.add('show'); A.setMuted(true); },
      () => { $('adCover').classList.remove('show'); A.setMuted(!!CG.S.sdkMuted); then(); });
  }

  // ---------- 그리기 ----------
  const cv = $('cv'), ctx = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1, allowPortrait = false;
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    $('ovPortrait').classList.toggle('show', isPortrait());
  }
  function isPortrait() { if (allowPortrait) return false; return isTouchDevice && window.innerHeight > window.innerWidth * 1.05; }
  const sx = x => W / 2 + (x - view.x) * view.s;
  const sy = y => H / 2 - (y - view.y) * view.s;

  function hillLayer(seed, parallax, baseY, amp, color) {
    ctx.fillStyle = color; ctx.beginPath();
    const ext = Math.hypot(W, H), step = 40, off = view.x * view.s * parallax;
    ctx.moveTo(-ext, ext);
    for (let px = -ext; px <= ext; px += step) {
      const u = (px + off) / 260;
      const h = Math.sin(u * 1.3 + seed) * 0.6 + Math.sin(u * 2.9 + seed * 2) * 0.3 + Math.sin(u * 0.5 + seed * 3) * 0.5;
      ctx.lineTo(px, baseY - h * amp);
    }
    ctx.lineTo(ext, ext); ctx.closePath(); ctx.fill();
  }
  function drawBackground() {
    const th = curTheme();
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-phiDeg * DEG);
    const ext = Math.hypot(W, H);
    const img = IMG['bg' + themeIdx()];
    // 바닥 색 (그림이 안 덮는 귀퉁이용)
    const gr0 = ctx.createLinearGradient(0, -H / 2, 0, H / 2);
    gr0.addColorStop(0, th.sky0); gr0.addColorStop(1, th.sky1);
    ctx.fillStyle = gr0; ctx.fillRect(-ext, -ext, ext * 2, ext * 2);
    if (img && img.complete && img.naturalWidth) {
      // 그림 배경: 화면보다 크게, 천천히 옆으로 흐름. 이어 붙일 때는 거울상으로 붙여 이음새가 안 보이게
      const ih = ext * 1.25, iw = ih * img.naturalWidth / img.naturalHeight;
      const per = iw * 2;
      const off = ((view.x * view.s * 0.05) % per + per) % per;
      const y = -ih * 0.66;
      for (let x = -off - iw * 1.5; x < ext; x += per) {
        ctx.drawImage(img, x, y, iw, ih);
        ctx.save(); ctx.translate(x + iw * 2, 0); ctx.scale(-1, 1); ctx.drawImage(img, 0, y, iw, ih); ctx.restore();
      }
    } else {
      const gr = ctx.createLinearGradient(0, -H / 2, 0, H / 2);
      gr.addColorStop(0, th.sky0); gr.addColorStop(1, th.sky1);
      ctx.fillStyle = gr; ctx.fillRect(-ext, -ext, ext * 2, ext * 2);
      ctx.fillStyle = th.sun; ctx.beginPath(); ctx.arc(W * 0.28, -H * 0.28, Math.min(W, H) * 0.07, 0, Math.PI * 2); ctx.fill();
      hillLayer(1.7, 0.08, H * 0.12, 60, th.far);
      hillLayer(4.1, 0.2, H * 0.26, 38, th.near);
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-ext, H * 0.12); ctx.lineTo(ext, H * 0.12); ctx.stroke();
    }
    ctx.restore();
  }

  function drawTerrain() {
    const def = sim.def, th = curTheme();
    const left = view.x - W / 2 / view.s - 2, right = view.x + W / 2 / view.s + 2;
    const bottom = view.y - H / 2 / view.s - 3;
    for (const g of def.gaps) {
      if (g.x1 < left || g.x0 > right) continue;
      const ytop = C.groundYAt(def.t.pieces, g.x0 - 0.3), fy = pitFloor(g);
      const grd = ctx.createLinearGradient(0, sy(ytop), 0, sy(fy));
      grd.addColorStop(0, 'rgba(40,30,25,.0)'); grd.addColorStop(0.15, 'rgba(40,30,25,.85)'); grd.addColorStop(1, '#120c09');
      ctx.fillStyle = grd; ctx.fillRect(sx(g.x0), sy(ytop), (g.x1 - g.x0) * view.s, sy(fy) - sy(ytop));
      ctx.fillStyle = '#2a1d16'; ctx.fillRect(sx(g.x0) - 2, sy(fy), (g.x1 - g.x0) * view.s + 4, H * 3);
      ctx.fillStyle = 'rgba(90,70,55,.6)'; for (let x = g.x0 + 0.4; x < g.x1; x += 0.9) { ctx.beginPath(); ctx.arc(sx(x), sy(fy) + 2, 0.18 * view.s, 0, Math.PI * 2); ctx.fill(); }
    }
    if (def.cliffX != null) {   // 낭떠러지 아래 계곡
      const fy = cliffFloor();
      ctx.fillStyle = '#355133'; ctx.fillRect(sx(def.cliffX), sy(fy), W + Math.abs(sx(def.cliffX)), H * 3);
      ctx.fillStyle = '#4b7047'; ctx.fillRect(sx(def.cliffX), sy(fy), W + Math.abs(sx(def.cliffX)), 0.25 * view.s);
    }
    for (let pi = 0; pi < def.t.pieces.length; pi++) {
      let pc = def.t.pieces[pi];
      if (pi === 0 && pc.length) pc = [[pc[0][0] - 40, pc[0][1]]].concat(pc);
      if (pc.length < 2 || pc[pc.length - 1][0] < left || pc[0][0] > right) continue;
      let i0 = 0, i1 = pc.length - 1;
      while (i0 < i1 && pc[i0 + 1][0] < left) i0++;
      while (i1 > i0 && pc[i1 - 1][0] > right) i1--;
      const yb = Math.min(bottom, pc[i0][1] - 2, pc[i1][1] - 2);
      ctx.beginPath(); ctx.moveTo(sx(pc[i0][0]), sy(pc[i0][1]));
      for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(sx(pc[i][0]), sy(pc[i][1]));
      ctx.lineTo(sx(pc[i1][0]), sy(yb) + H); ctx.lineTo(sx(pc[i0][0]), sy(yb) + H); ctx.closePath();
      ctx.fillStyle = th.dirt; ctx.fill();
      ctx.beginPath(); ctx.moveTo(sx(pc[i0][0]), sy(pc[i0][1]));
      for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(sx(pc[i][0]), sy(pc[i][1]));
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = th.dirt2; ctx.lineWidth = 0.55 * view.s; ctx.stroke();
      ctx.strokeStyle = th.grass; ctx.lineWidth = 0.2 * view.s; ctx.stroke();
      ctx.strokeStyle = th.grass2; ctx.lineWidth = 0.05 * view.s; ctx.stroke();
    }
    for (const c of def.ceil) {
      if (c[c.length - 1][0] < left || c[0][0] > right) continue;
      const top = def.rockTop + 8;
      ctx.beginPath(); ctx.moveTo(sx(c[0][0]), sy(top));
      for (const p of c) ctx.lineTo(sx(p[0]), sy(p[1]));
      ctx.lineTo(sx(c[c.length - 1][0]), sy(top)); ctx.closePath();
      ctx.fillStyle = th.rock; ctx.fill();
      ctx.strokeStyle = th.rock2; ctx.lineWidth = 0.12 * view.s; ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,.12)';
      for (let x = c[1][0]; x < c[c.length - 2][0]; x += 1.7) { ctx.beginPath(); ctx.arc(sx(x), sy(c[2][1] + 0.8 + ((x * 7.3) % 1) * 0.8), 0.25 * view.s, 0, Math.PI * 2); ctx.fill(); }
    }
    // 바람 구간 표시 (바닥에 흐르는 줄)
    for (const w of def.winds) {
      if (w.x1 < left || w.x0 > right) continue;
      const tnow = performance.now() / 1000;
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2;
      for (let k = 0; k < 14; k++) {
        const len = w.x1 - w.x0;
        const u = (((k / 14) + tnow * 0.25 * Math.sign(w.f) * 1.4) % 1 + 1) % 1;
        const x = w.x0 + u * len, y = C.groundYAt(def.t.pieces, x);
        if (y == null) continue;
        const hy = 0.6 + (k % 4) * 0.8;
        ctx.globalAlpha = 0.25 + 0.5 * Math.sin(u * Math.PI);
        ctx.beginPath(); ctx.moveTo(sx(x), sy(y + hy)); ctx.lineTo(sx(x + 1.4 * Math.sign(w.f)), sy(y + hy + 0.05)); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawPole(x, h, color) {
    const gy = C.groundYAt(sim.def.t.pieces, x);
    if (gy == null) return null;
    ctx.strokeStyle = color || '#5b4636'; ctx.lineWidth = 0.08 * view.s;
    ctx.beginPath(); ctx.moveTo(sx(x), sy(gy)); ctx.lineTo(sx(x), sy(gy + h)); ctx.stroke();
    return gy;
  }
  function drawZone(z, color, label) {
    const s = view.s;
    ctx.beginPath();
    for (let x = z.x0; x <= z.x1 + 0.001; x += 0.25) { const y = C.groundYAt(sim.def.t.pieces, x); x === z.x0 ? ctx.moveTo(sx(x), sy(y)) : ctx.lineTo(sx(x), sy(y)); }
    ctx.strokeStyle = color; ctx.lineWidth = 0.22 * s; ctx.stroke();
    for (const x of [z.x0, z.x1]) {
      const gy = drawPole(x, 2.0, '#333'); if (gy == null) continue;
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(sx(x), sy(gy + 2.0)); ctx.lineTo(sx(x) + 0.7 * s, sy(gy + 1.8)); ctx.lineTo(sx(x), sy(gy + 1.6)); ctx.fill();
    }
    if (label) {
      const mx = (z.x0 + z.x1) / 2, my = C.groundYAt(sim.def.t.pieces, mx) + 2.6;
      ctx.font = 'bold ' + Math.round(0.45 * s) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(label).width + 0.4 * s;
      ctx.fillStyle = 'rgba(15,29,43,.75)'; ctx.fillRect(sx(mx) - tw / 2, sy(my) - 0.33 * s, tw, 0.66 * s);
      ctx.fillStyle = color; ctx.fillText(label, sx(mx), sy(my));
    }
  }
  function drawProps() {
    const def = sim.def, s = view.s;
    for (const sg of def.signs) {
      const gy = drawPole(sg.x, 1.5); if (gy == null) continue;
      const bx = sx(sg.x), by = sy(gy + 1.75), r = 0.48 * s;
      const col = { rabbit: '#e07b00', turtle: '#2f8f4e', wind: '#3b82c4', stop: '#c94834', ice: '#3b9fd8', rock: '#7a6f66', mud: '#7a5233', jump: '#e8553d' }[sg.kind];
      ctx.fillStyle = '#fff'; ctx.strokeStyle = col; ctx.lineWidth = 0.09 * s;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx - r, by - r, r * 2, r * 2, 0.15 * s) : ctx.rect(bx - r, by - r, r * 2, r * 2);
      ctx.fill(); ctx.stroke();
      ctx.font = Math.round(0.62 * s) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (sg.kind === 'wind') {
        ctx.save(); ctx.translate(bx, by + 0.03 * s); if (sg.dir < 0) ctx.scale(-1, 1); ctx.fillText('💨', 0, 0); ctx.restore();
      } else ctx.fillText({ rabbit: '🐇', turtle: '🐢', stop: '🛑', ice: '🧊', rock: '🪨', mud: '💦', jump: '⤴️' }[sg.kind], bx, by + 0.03 * s);
    }
    if (def.finish != null) {
      const gy = drawPole(def.finish, 2.3, '#333');
      if (gy != null) { const fx = sx(def.finish), fy = sy(gy + 2.3), cw = 0.2 * s; for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { ctx.fillStyle = (r + c) % 2 ? '#111' : '#fff'; ctx.fillRect(fx + c * cw, fy + r * cw, cw, cw); } }
    }
    if (def.stopZone) drawZone(def.stopZone, 'rgba(255,212,59,.95)', T('stopHere'));
    // 검문소
    for (const gt of sim.gates) {
      drawZone(gt.def.zone, 'rgba(255,212,59,.95)', gt.open ? null : T('stopZone'));
      const gx = sx(gt.def.x), gy = sy(gt.gy);
      ctx.fillStyle = '#444'; ctx.fillRect(gx - 0.14 * s, gy - 1.3 * s, 0.28 * s, 1.3 * s);
      ctx.save(); ctx.translate(gx, gy - 1.2 * s); ctx.rotate(-gt.lift * Math.PI / 2 * 0.95);
      const bl = 2.9 * s, bh = 0.22 * s;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, -bh / 2, bl, bh);
      ctx.fillStyle = '#c94834'; for (let k = 0; k < 5; k += 2) ctx.fillRect(k * bl / 5, -bh / 2, bl / 5, bh);
      ctx.restore();
    }
    // 썩은 다리 판자
    for (const br of sim.bridges) {
      for (const pl of br.planks) {
        const p = pl.body.getPosition(), a = pl.body.getAngle();
        const w = (br.def.x1 - br.def.x0) / br.planks.length;
        ctx.save(); ctx.translate(sx(p.x), sy(p.y)); ctx.rotate(-a);
        ctx.fillStyle = pl.fallen ? '#6b4a2e' : '#8a5a34'; ctx.fillRect(-w / 2 * s + 1, -0.12 * s, w * s - 2, 0.24 * s);
        ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(-w / 2 * s + 1, -0.12 * s, w * s - 2, 0.05 * s);
        ctx.restore();
      }
      if (br.touchedAt == null) {
        // 밧줄
        ctx.strokeStyle = '#5b4636'; ctx.lineWidth = 0.05 * s; ctx.beginPath();
        ctx.moveTo(sx(br.def.x0), sy(br.def.y + 0.9)); ctx.quadraticCurveTo(sx((br.def.x0 + br.def.x1) / 2), sy(br.def.y + 0.5), sx(br.def.x1), sy(br.def.y + 0.9)); ctx.stroke();
      }
    }
  }

  function wp(lx, ly) { const p = sim.chassis.getWorldPoint({ x: lx, y: ly }); return [sx(p.x), sy(p.y)]; }
  function line(a, b, w, color) { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  function ik(hip, foot, l1, l2, bendSign) {
    const dx = foot[0] - hip[0], dy = foot[1] - hip[1];
    const d = Math.min(Math.hypot(dx, dy), l1 + l2 - 0.01);
    const a = Math.atan2(dy, dx);
    const b = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
    const k = a - bendSign * b;
    return [hip[0] + Math.cos(k) * l1, hip[1] + Math.sin(k) * l1];
  }
  function drawBike(speed) {
    const s = view.s;
    const k = Math.min(1, Math.max(0, (speed - 3) / 10));
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const w of sim.wheels) {
      const p = w.body.getPosition(), a = w.body.getAngle();
      const cx = sx(p.x), cy = sy(p.y), r = C.R * s;
      const om = Math.abs(w.body.getAngularVelocity()) * C.R;
      ctx.strokeStyle = '#222'; ctx.lineWidth = 0.09 * s;
      ctx.beginPath(); ctx.arc(cx, cy, r - 0.045 * s, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = om > 7 ? 'rgba(90,90,90,.35)' : '#777'; ctx.lineWidth = 0.025 * s;
      for (let i = 0; i < 6; i++) { const t = -a + i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(t) * (r - 0.09 * s), cy + Math.sin(t) * (r - 0.09 * s)); ctx.stroke(); }
      if (om > 7) { ctx.strokeStyle = 'rgba(120,120,120,.35)'; ctx.lineWidth = 0.12 * s; ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(cx, cy, 0.04 * s, 0, Math.PI * 2); ctx.fill();
    }
    const rw = sim.wheels[0].body.getPosition(), fw = sim.wheels[1].body.getPosition();
    const RA = [sx(rw.x), sy(rw.y)], FA = [sx(fw.x), sy(fw.y)];
    const BB = wp(-0.05, 0.14), SEAT = wp(-0.24, 0.56), HEAD = wp(0.38, 0.58), BAR = wp(0.44, 0.72);
    const fc = '#2b6cb0', fw2 = 0.07 * s;
    line(RA, BB, fw2, fc); line(RA, SEAT, fw2, fc); line(SEAT, BB, fw2, fc); line(BB, HEAD, fw2, fc); line(SEAT, HEAD, fw2, fc);
    line(HEAD, FA, fw2, fc); line(HEAD, BAR, 0.06 * s, '#333');
    line(wp(-0.34, 0.6), wp(-0.14, 0.6), 0.08 * s, '#222');
    const HIP = wp(-0.24, 0.66);
    const SH = wp(0.02 + 0.12 * k, 1.12 - 0.14 * k);
    const HD = wp(0.1 + 0.08 * k, 1.32 - 0.1 * k);
    const crank = 0.17;
    const F1 = wp(-0.05 + crank, 0.14), F2 = wp(-0.05 - crank, 0.14);
    const legL = 0.43 * s;
    const K2 = ik(HIP, F2, legL, legL, -1);
    line(HIP, K2, 0.1 * s, '#26324a'); line(K2, F2, 0.09 * s, '#26324a');
    line(HIP, SH, 0.2 * s, '#e8553d');
    const K1 = ik(HIP, F1, legL, legL, -1);
    line(HIP, K1, 0.11 * s, '#33415c'); line(K1, F1, 0.1 * s, '#33415c');
    const EL = ik(SH, BAR, 0.3 * s, 0.3 * s, 1);
    line(SH, EL, 0.08 * s, '#e8553d'); line(EL, BAR, 0.07 * s, '#f2c29b');
    ctx.fillStyle = '#f2c29b'; ctx.beginPath(); ctx.arc(HD[0], HD[1], 0.15 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23f';
    const ang = -sim.chassis.getAngle();
    ctx.beginPath(); ctx.arc(HD[0], HD[1], 0.17 * s, Math.PI + ang - 0.2, ang + 0.25); ctx.closePath(); ctx.fill();
  }
  const winds = Array.from({ length: 26 }, () => ({ x: Math.random(), y: Math.random(), l: 0.5 + Math.random() }));
  function drawWind(speed, vx, windF, dt) {
    const a = Math.min(0.55, Math.max(0, (speed - 5) / 12)) + Math.min(0.5, Math.abs(windF) / 8);
    if (a <= 0) return;
    ctx.strokeStyle = 'rgba(255,255,255,' + a + ')'; ctx.lineWidth = 2;
    const n = Math.round(winds.length * Math.min(1, Math.max((speed - 4) / 10, Math.abs(windF) / 4)));
    const rel = vx - windF * 1.5;
    for (let i = 0; i < n; i++) {
      const w = winds[i];
      w.x -= (rel * 1.4 * view.s * dt) / W;
      if (w.x < -0.2) { w.x = 1.1 + Math.random() * 0.2; w.y = Math.random(); }
      if (w.x > 1.3) { w.x = -0.1; w.y = Math.random(); }
      const len = w.l * (Math.abs(rel) + 2) * 3 * Math.sign(rel || 1);
      ctx.beginPath(); ctx.moveTo(w.x * W, w.y * H); ctx.lineTo(w.x * W + len, w.y * H); ctx.stroke();
    }
  }
  // ---------- 1인칭 (롤러코스터) ----------
  // 물리는 그대로 2D. 라이더 눈 위치에서 앞(+x)을 보고, 길의 높낮이를 원근으로 펼쳐 그림.
  const FP_ROAD = [ { road: '#6b6f78', road2: '#737781', line: '#f4f4f4', rumbleA: '#ffffff', rumbleB: '#e8553d', grassB: '#45a049' },
                    { road: '#a0623a', road2: '#a9693f', line: '#ffe2b8', rumbleA: '#fff2d6', rumbleB: '#c9542a', grassB: '#cf8e45' },
                    { road: '#5b6579', road2: '#636d82', line: '#e9f1fa', rumbleA: '#ffffff', rumbleB: '#3b82c4', grassB: '#dbe5f2' } ];
  const fp = { pitch: 0, kick: 0, bob: 0, cache: null, cacheFor: null };
  // 틈·낭떠러지 추락: 바닥 깊이(m) — 그림과 연출만, 물리 판정은 그대로
  const PIT_DEPTH = 14, CLIFF_DEPTH = 28;
  let fall = null;   // { kind, floorY, lipY, impactT, parts, flash, x0 }
  function gapAt(x) { return sim.def.gaps.find(g => x >= g.x0 && x <= g.x1); }
  function pitFloor(g) { return C.groundYAt(sim.def.t.pieces, g.x0 - 0.3) - PIT_DEPTH; }
  function cliffFloor() { const d = sim.def; return d.cliffX != null ? C.groundYAt(d.t.pieces, d.cliffX - 0.3) - CLIFF_DEPTH : null; }
  function startFall(kind) {
    const x = sim.chassis.getPosition().x;
    const g = kind === 'gap' && sim.def.gaps.length ? (gapAt(x) || sim.def.gaps.reduce((a, b) => Math.abs((b.x0 + b.x1) / 2 - x) < Math.abs((a.x0 + a.x1) / 2 - x) ? b : a)) : null;
    const floorY = g ? pitFloor(g) : cliffFloor();
    if (floorY == null || isNaN(floorY)) { A.SFX.crash(); return; }
    const lipY = g ? C.groundYAt(sim.def.t.pieces, g.x0 - 0.3) : floorY + CLIFF_DEPTH;
    fall = { kind, floorY, lipY, impactT: null, parts: [], flash: 0, x0: g ? g.x0 : sim.def.cliffX, x1: g ? g.x1 : null };
    // 땅·벽에 걸리지 않고 끝까지 떨어지게: 자전거 충돌을 끔
    for (const b of [sim.chassis, ...sim.wheels.map(w => w.body)]) for (let f = b.getFixtureList(); f; f = f.getNext()) f.setFilterData({ groupIndex: -1, categoryBits: 1, maskBits: 0 });
    A.SFX.fall();
  }
  function updateFall(dt) {
    if (!fall) return;
    const pc = sim.chassis.getPosition(), eye = { x: pc.x + 0.3, y: pc.y + 1.3 };
    fall.flash = Math.max(0, fall.flash - dt * 2.5);
    if (fall.impactT == null && fall.x1 != null) {
      // 구덩이: 맞은편 벽을 뚫고 나가지 않게
      const lim = fall.x1 - 0.7, p = sim.chassis.getPosition();
      if (p.x > lim) for (const b of [sim.chassis, ...sim.wheels.map(w => w.body)]) {
        const v = b.getLinearVelocity(), q = b.getPosition();
        b.setPosition({ x: q.x - (p.x - lim), y: q.y }); b.setLinearVelocity({ x: Math.min(0, v.x) * 0.3, y: v.y });
      }
    }
    if (fall.impactT == null) {
      const v = Math.abs(sim.chassis.getLinearVelocity().y);
      for (let i = 0; i < Math.min(6, 1 + v * 0.4); i++) fall.parts.push({ x: Math.random() * W, y: H + 10, vy: -(400 + v * 90 + Math.random() * 300), r: 1 + Math.random() * 3, a: 0.5 + Math.random() * 0.4, dust: false });
      if (eye.y < fall.floorY + 1.5) {
        fall.impactT = endT; fall.flash = 1; view.shake = 26; fp.kick = 1.6;
        A.SFX.thud(); vibrate([90, 40, 140]);
        for (const b of [sim.chassis, ...sim.wheels.map(w => w.body)]) { b.setLinearVelocity({ x: 0, y: 0 }); b.setAngularVelocity(0); b.setStatic(); }
        for (let i = 0; i < 70; i++) { const ang = Math.PI * (1 + Math.random()); const sp = 120 + Math.random() * 520; fall.parts.push({ x: W / 2 + (Math.random() - 0.5) * W * 0.6, y: H * 0.8, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: 2 + Math.random() * 7, a: 0.7, dust: true }); }
      }
    }
    for (const p of fall.parts) { p.x += (p.vx || 0) * dt; p.y += p.vy * dt; if (p.dust) { p.vy += 500 * dt; p.a -= dt * 0.7; } }
    fall.parts = fall.parts.filter(p => p.y > -20 && p.a > 0 && p.y < H + 40);
  }
  function drawFallFx(depth) {
    if (!fall) return;
    const k = Math.max(0, Math.min(1, depth / (fall.kind === 'gap' ? PIT_DEPTH : CLIFF_DEPTH)));
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) * 0.6);
    vg.addColorStop(0, 'rgba(0,0,0,' + (0.15 * k) + ')'); vg.addColorStop(1, 'rgba(0,0,0,' + (0.25 + 0.55 * k) + ')');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    if (fall.impactT == null) {
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.12 + 0.25 * k) + ')'; ctx.lineWidth = 2;
      const t = performance.now() / 1000;
      for (let i = 0; i < 18; i++) { const x = ((i * 137.5) % W), y = H - ((t * (900 + i * 40)) % (H + 200)); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 60 + k * 120); ctx.stroke(); }
    }
    for (const p of fall.parts) { ctx.fillStyle = p.dust ? 'rgba(150,120,95,' + Math.max(0, p.a) + ')' : 'rgba(110,90,75,' + p.a + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
    if (fall.flash > 0) { ctx.fillStyle = 'rgba(30,10,5,' + (fall.flash * 0.75) + ')'; ctx.fillRect(0, 0, W, H); }
  }

  function fpCache() {
    if (fp.cacheFor === sim) return fp.cache;
    const pcs = sim.def.t.pieces;
    let x0 = Infinity, x1 = -Infinity;
    for (const pc of pcs) for (const p of pc) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); }
    x0 -= 40;                                // 출발점 왼쪽 땅(그림만)
    const step = 0.1, n = Math.ceil((x1 - x0) / step) + 2, ys = new Float32Array(n), cs = new Float32Array(n);
    const first = pcs[0][0];
    for (let i = 0; i < n; i++) {
      const x = x0 + i * step;
      let y = C.groundYAt(pcs, x);
      if (y == null && x < first[0]) y = first[1];
      ys[i] = y == null ? NaN : y;
      let c = NaN;
      for (const ch of sim.def.ceil) for (let k = 1; k < ch.length; k++) {
        const [ax, ay] = ch[k - 1], [bx, by] = ch[k];
        if (x >= ax && x <= bx && bx > ax) { c = ay + (by - ay) * (x - ax) / (bx - ax); break; }
      }
      cs[i] = c;
    }
    fp.cache = { x0, step, ys, cs }; fp.cacheFor = sim;
    return fp.cache;
  }
  function fpLookup(arr, x) {
    const c = fp.cache, u = (x - c.x0) / c.step, i = Math.floor(u);
    if (i < 0 || i >= arr.length - 1) return NaN;
    const a = arr[i], b = arr[i + 1];
    if (isNaN(a) || isNaN(b)) return NaN;
    return a + (b - a) * (u - i);
  }
  // 보기 좋게 길을 좌우로 살짝 굽힘 (그림만, 물리와 무관)
  const curve = x => 3.2 * Math.sin(x / 23) + 1.6 * Math.sin(x / 9.5 + 1.3);
  const curveD = x => 3.2 / 23 * Math.cos(x / 23) + 1.6 / 9.5 * Math.cos(x / 9.5 + 1.3);

  function renderFP(dt) {
    const def = sim.def, th = curTheme(), rd = FP_ROAD[themeIdx()];
    const snap = sim.snapshot();
    fpCache();
    const ch = sim.chassis;
    const eye = fall ? (() => { const p = ch.getPosition(); return { x: p.x + 0.3, y: p.y + 1.3 }; })() : ch.getWorldPoint({ x: 0.16, y: 1.45 });
    let ang = fall ? -0.75 : ch.getAngle();      // 떨어질 때는 시선을 아래로 숙여 바닥이 다가오는 게 보이게
    while (ang - fp.pitch > Math.PI) ang -= 2 * Math.PI;
    while (ang - fp.pitch < -Math.PI) ang += 2 * Math.PI;
    fp.pitch += (ang - fp.pitch) * (1 - Math.exp(-dt / (fall ? 0.35 : 0.1)));
    fp.kick *= Math.exp(-dt / 0.12);
    const kz = Math.min(1, snap.speed / 14);
    const pitch = fp.pitch - 8 * DEG + fp.kick * 0.05;
    const f = (H / 2) / Math.tan((33 + 9 * kz) * DEG);
    let shx = 0, shy = 0;
    if (view.shake > 0) { shx = (Math.random() - 0.5) * view.shake; shy = (Math.random() - 0.5) * view.shake; view.shake = Math.max(0, view.shake - dt * 40); }
    if (snap.grounded > 0 && snap.speed > 1) { shx += (Math.random() - 0.5) * Math.min(2.5, snap.speed * 0.15); shy += (Math.random() - 0.5) * Math.min(2.5, snap.speed * 0.15); }
    if (LAB && LAB.shake) { shx += (Math.random() - 0.5) * LAB.shake * 2.2; shy += (Math.random() - 0.5) * LAB.shake * 3; }
    const cx = W / 2 + shx, cy = H * 0.44 + shy + fp.kick * H * 0.03;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const camX = eye.x, camY = eye.y, c0 = curve(camX), cd0 = curveD(camX);
    const lat = x => curve(x) - c0 - cd0 * (x - camX);
    const proj = (x, y, z) => {
      const dx = x - camX, dy = y - camY;
      const fw = dx * cp + dy * sp, up = -dx * sp + dy * cp;
      if (fw < 0.06) return null;
      return [cx + f * z / fw, cy - f * up / fw, fw];
    };
    // 하늘 + 지평선 (폰 기울기만큼 지평선이 올라가거나 내려감)
    const phi = phiDeg * DEG;
    let rel = phi - pitch, flip = false;
    if (LAB) { rel = Math.atan2(Math.sin(rel), Math.cos(rel)); if (Math.cos(rel) < 0) { flip = true; rel = rel > 0 ? rel - Math.PI : rel + Math.PI; } }   // [실험실] 루프에서 거꾸로 매달리면 하늘이 아래
    const yh = cy - f * Math.tan(Math.max(-1.2, Math.min(1.2, rel)));
    const gr = ctx.createLinearGradient(0, yh - H, 0, yh);
    gr.addColorStop(0, th.sky0); gr.addColorStop(1, th.sky1);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    const img = IMG['bg' + themeIdx()];
    if (flip) {
      const g2 = ctx.createLinearGradient(0, yh, 0, yh + H); g2.addColorStop(0, th.sky1); g2.addColorStop(1, th.sky0);
      ctx.fillStyle = g2; ctx.fillRect(0, yh, W, H);
      ctx.fillStyle = th.near; ctx.fillRect(0, 0, W, Math.max(0, yh));
    } else if (img && img.complete && img.naturalWidth) {
      const iw = W * 1.35, ih = iw * img.naturalHeight / img.naturalWidth;
      const per = iw * 2, off = (((camX * 6) % per) + per) % per;
      const y = yh - ih * 0.62;
      for (let x = -off - iw; x < W; x += per) {
        ctx.drawImage(img, x, y, iw, ih);
        ctx.save(); ctx.translate(x + iw * 2, 0); ctx.scale(-1, 1); ctx.drawImage(img, 0, y, iw, ih); ctx.restore();
      }
      ctx.fillStyle = th.near; ctx.fillRect(0, y + ih - 1, W, H);
    } else {
      ctx.fillStyle = th.far; ctx.fillRect(0, yh, W, H);
    }
    // 그릴 것 목록 (먼 것부터)
    const items = [];
    const HW = 1.7, RB = 0.32;
    const xs = [];
    if (fall) for (let d = -14; d < 0.25; d += 0.35) xs.push(camX + d);   // 내려다볼 때는 발밑·뒤쪽 바닥도
    else if (LAB && sim.rail) for (let d = -30; d < 0.25; d += 0.5) xs.push(camX + d);   // [실험실] 루프 안: 뒤쪽 길도
    for (let d = 0.25; d < 80;) { xs.push(camX + d); d += d < 10 ? 0.35 : d < 25 ? 0.7 : d < 45 ? 1.4 : 2.6; }
    const inZone = (x, z) => z && x >= z.x0 && x <= z.x1;
    for (let i = 0; i < xs.length - 1; i++) {
      const xa = xs[i], xb = xs[i + 1];
      const ya = fpLookup(fp.cache.ys, xa), yb = fpLookup(fp.cache.ys, xb);
      const ca = fpLookup(fp.cache.cs, xa), cb = fpLookup(fp.cache.cs, xb);
      const la = lat(xa), lb = lat(xb);
      if (isNaN(ya) || isNaN(yb)) {
        // 틈: 깊은 구덩이 바닥 / 낭떠러지: 저 아래 계곡 바닥
        const g = def.gaps.find(g => xa >= g.x0 - 0.5 && xa <= g.x1 + 0.5);
        const cliff = !g && def.cliffX != null && xa > def.cliffX;
        const fy = g ? pitFloor(g) : cliff ? cliffFloor() : null;
        if (fy == null || isNaN(fy)) continue;
        const pa = proj(xa, fy, 0), pb = proj(xb, fy, 0);
        if (!pa || !pb || pa[1] < pb[1] - 0.5) continue;
        const stripe = Math.floor((xa + xb) / 2 / 1.2) % 2 === 0;
        items.push({ fw: pa[2], draw() {
          ctx.fillStyle = g ? (stripe ? '#2a1d16' : '#241912') : (stripe ? '#3d5a3a' : '#355133');
          ctx.fillRect(0, pb[1] - 0.5, W, pa[1] - pb[1] + 1.5);
          if (g && stripe) { ctx.fillStyle = 'rgba(90,70,55,.5)'; const w = f / pa[2]; for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.arc(pa[0] + k * 2.1 * w, pa[1] - 2, Math.max(1, 0.25 * w), 0, Math.PI * 2); ctx.fill(); } }
        } });
        continue;
      }
      const A = proj(xa, ya, la), B = proj(xb, yb, lb);
      if (!A || !B) continue;
      if (A[1] < B[1] - 0.5 && !(LAB && sim.rail)) continue;      // 고개 너머(뒷면)
      const wa = f / A[2], wb = f / B[2];
      const mid = (xa + xb) / 2;
      const stripe = Math.floor(mid / 1.2) % 2 === 0;
      const zoneHere = inZone(mid, def.stopZone) || sim.gates.some(g => !g.open && inZone(mid, g.def.zone));
      const wind = def.winds.some(w => mid >= w.x0 && mid <= w.x1);
      const ceil = !isNaN(ca) && !isNaN(cb) ? [proj(xa, ca, la), proj(xb, cb, lb)] : null;
      items.push({ fw: A[2], draw() {
        ctx.fillStyle = stripe ? th.grass : rd.grassB;
        ctx.fillRect(0, B[1] - 0.5, W, A[1] - B[1] + 1.5);
        const quad = (h0, h1, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(A[0] + h0 * wa, A[1]); ctx.lineTo(A[0] + h1 * wa, A[1]); ctx.lineTo(B[0] + h1 * wb, B[1] + 0.5); ctx.lineTo(B[0] + h0 * wb, B[1] + 0.5); ctx.closePath(); ctx.fill(); };
        quad(-HW - RB, HW + RB, stripe ? rd.rumbleA : rd.rumbleB);
        const sc = LAB && LAB.fpRoad(def, mid, stripe);
        quad(-HW, HW, zoneHere ? (stripe ? '#ffd43b' : '#f5c518') : sc || (stripe ? rd.road : rd.road2));
        if (stripe && !zoneHere) quad(-0.06, 0.06, rd.line);
        if (wind) { ctx.globalAlpha = 0.18; quad(-HW, HW, '#ffffff'); ctx.globalAlpha = 1; }
        if (ceil && ceil[0] && ceil[1]) {
          const [P, Q] = ceil;
          ctx.fillStyle = stripe ? th.rock : th.rock2;
          ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(W, -10); ctx.lineTo(W, Q[1]); ctx.lineTo(0, Q[1]); ctx.closePath(); ctx.fill();
          ctx.fillStyle = stripe ? th.rock : th.rock2;
          ctx.fillRect(0, Math.min(P[1], Q[1]) - 0.5, W, Math.abs(P[1] - Q[1]) + 1);
        }
      } });
    }
    // 구덩이 양쪽 절벽 벽 (지층 무늬) — 떨어질 때 위로 스쳐 지나감
    for (const g of def.gaps) {
      if (sim.bridges.some(b => Math.abs(b.def.x0 - g.x0) < 0.01) && !(fall && fall.x0 === g.x0)) continue;   // 멀쩡한 다리 밑은 생략
      const bot = pitFloor(g);
      for (const [wx, side] of [[g.x1, 1], [g.x0, -1]]) {
        if (side < 0 && !fall) continue;                         // 앞쪽 벽은 떨어질 때만 보임
        const top = C.groundYAt(def.t.pieces, wx + side * 0.05);
        if (top == null) continue;
        const Bt = proj(wx, bot, 0); if (!Bt) continue;
        items.push({ fw: Bt[2] + 0.001, draw() {
          const n = Math.ceil((top - bot) / 1.1);
          for (let k = 0; k < n; k++) {
            const ya = top - k * 1.1, yb = Math.max(bot, ya - 1.1);
            const A = proj(wx, ya, 0), B = proj(wx, yb, 0); if (!A || !B) continue;
            const dark = k / n, c = k % 2 ? [122, 86, 62] : [104, 72, 52];
            ctx.fillStyle = 'rgb(' + c.map(v => Math.round(v * (1 - 0.6 * dark))).join(',') + ')';
            ctx.fillRect(0, Math.min(A[1], B[1]) - 0.5, W, Math.abs(B[1] - A[1]) + 1);
          }
        } });
      }
    }
    // 다리 판자
    for (const br of sim.bridges) {
      const w = (br.def.x1 - br.def.x0) / br.planks.length;

      for (const pl of br.planks) {
        const p = pl.body.getPosition(), l = lat(p.x);
        const A = proj(p.x - w / 2, p.y + 0.12, l), B = proj(p.x + w / 2, p.y + 0.12, l);
        if (!A || !B) continue;
        items.push({ fw: A[2], draw() {
          const wa = f / A[2], wb = f / B[2];
          ctx.fillStyle = pl.fallen ? '#5e4129' : '#8a5a34';
          ctx.beginPath(); ctx.moveTo(A[0] - HW * wa, A[1]); ctx.lineTo(A[0] + HW * wa, A[1]); ctx.lineTo(B[0] + HW * wb, B[1]); ctx.lineTo(B[0] - HW * wb, B[1]); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = Math.max(1, 0.05 * wa); ctx.stroke();
        } });
      }
    }
    const pole = (x, z, h, color, w) => {
      const gy = fpLookup(fp.cache.ys, x); if (isNaN(gy)) return null;
      const P = proj(x, gy, lat(x) + z), Q = proj(x, gy + h, lat(x) + z);
      if (!P || !Q) return null;
      return { P, Q, fw: P[2], draw() { ctx.strokeStyle = color || '#5b4636'; ctx.lineWidth = Math.max(1.5, (w || 0.1) * f / P[2]); ctx.beginPath(); ctx.moveTo(P[0], P[1]); ctx.lineTo(Q[0], Q[1]); ctx.stroke(); } };
    };
    // 표지판 (길 오른쪽)
    for (const sg of def.signs) {
      const pl = pole(sg.x, 2.7, 1.6); if (!pl) continue;
      items.push({ fw: pl.fw, draw() {
        pl.draw();
        const s = f / pl.fw, r = 0.5 * s, bx = pl.Q[0], by = pl.Q[1] - r * 0.6;
        const col = { rabbit: '#e07b00', turtle: '#2f8f4e', wind: '#3b82c4', stop: '#c94834', ice: '#3b9fd8', rock: '#7a6f66', mud: '#7a5233', jump: '#e8553d' }[sg.kind];
        ctx.fillStyle = '#fff'; ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, 0.09 * s);
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx - r, by - r, r * 2, r * 2, 0.15 * s) : ctx.rect(bx - r, by - r, r * 2, r * 2); ctx.fill(); ctx.stroke();
        ctx.font = Math.max(6, Math.round(0.64 * s)) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (sg.kind === 'wind') { ctx.save(); ctx.translate(bx, by); if (sg.dir < 0) ctx.scale(-1, 1); ctx.fillText('💨', 0, 0); ctx.restore(); }
        else ctx.fillText({ rabbit: '🐇', turtle: '🐢', stop: '🛑', ice: '🧊', rock: '🪨', mud: '💦', jump: '⤴️' }[sg.kind], bx, by);
      } });
    }
    // 결승 아치
    if (def.finish != null) {
      const L = pole(def.finish, -2.4, 3.0, '#333', 0.14), R = pole(def.finish, 2.4, 3.0, '#333', 0.14);
      if (L && R) items.push({ fw: L.fw, draw() {
        L.draw(); R.draw();
        const s = f / L.fw, h = 0.55 * s, n = 10, w = (R.Q[0] - L.Q[0]) / n;
        for (let r = 0; r < 2; r++) for (let c = 0; c < n; c++) { ctx.fillStyle = (r + c) % 2 ? '#111' : '#fff'; ctx.fillRect(L.Q[0] + c * w, L.Q[1] + r * h / 2, w + 0.5, h / 2 + 0.5); }
      } });
    }
    // 멈춤 구역 깃발 + 글씨
    const zoneFlags = (z, label) => {
      for (const x of [z.x0, z.x1]) for (const side of [-2.3, 2.3]) {
        const pl = pole(x, side, 2.2, '#333', 0.08); if (!pl) continue;
        items.push({ fw: pl.fw, draw() { pl.draw(); const s = f / pl.fw; ctx.fillStyle = '#ffd43b'; ctx.beginPath(); ctx.moveTo(pl.Q[0], pl.Q[1]); ctx.lineTo(pl.Q[0] - Math.sign(side) * 0.7 * s, pl.Q[1] + 0.2 * s); ctx.lineTo(pl.Q[0], pl.Q[1] + 0.4 * s); ctx.fill(); } });
      }
      if (label) {
        const mx = (z.x0 + z.x1) / 2, gy = fpLookup(fp.cache.ys, mx); if (isNaN(gy)) return;
        const P = proj(mx, gy + 3.0, lat(mx)); if (!P) return;
        items.push({ fw: P[2] - 0.01, draw() {
          const s = f / P[2]; ctx.font = 'bold ' + Math.max(8, Math.round(0.5 * s)) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const tw = ctx.measureText(label).width + 0.4 * s;
          ctx.fillStyle = 'rgba(15,29,43,.75)'; ctx.fillRect(P[0] - tw / 2, P[1] - 0.36 * s, tw, 0.72 * s);
          ctx.fillStyle = '#ffd43b'; ctx.fillText(label, P[0], P[1]);
        } });
      }
    };
    if (def.stopZone) zoneFlags(def.stopZone, T('stopHere'));
    // 검문소 차단기
    for (const gt of sim.gates) {
      zoneFlags(gt.def.zone, gt.open ? null : T('stopZone'));
      const x = gt.def.x, gy = gt.gy, l = lat(x);
      const base = proj(x, gy, l + 2.3), top = proj(x, gy + 1.15, l + 2.3);
      if (!base || !top) continue;
      items.push({ fw: base[2], draw() {
        const s = f / base[2];
        ctx.fillStyle = '#444'; ctx.fillRect(base[0] - 0.12 * s, top[1], 0.24 * s, base[1] - top[1]);
        const a = gt.lift * Math.PI / 2 * 0.92, len = 4.6;
        const end = proj(x, gy + 1.05 + Math.sin(a) * len, l + 2.3 - Math.cos(a) * len);
        if (!end) return;
        const n = 6;
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 1) / n;
          ctx.strokeStyle = k % 2 ? '#fff' : '#c94834'; ctx.lineWidth = Math.max(2, 0.2 * s); ctx.lineCap = 'butt';
          ctx.beginPath(); ctx.moveTo(top[0] + (end[0] - top[0]) * t0, top[1] + (end[1] - top[1]) * t0); ctx.lineTo(top[0] + (end[0] - top[0]) * t1, top[1] + (end[1] - top[1]) * t1); ctx.stroke();
        }
      } });
    }
    const lg = LAB ? { ctx, sim, proj, lat, f, HW, rd, W, H, dt } : null;
    if (LAB) { for (const it of LAB.fpItems(lg)) items.push(it); LAB.fogBegin(def); }
    items.sort((a, b) => b.fw - a.fw);
    for (const it of items) { if (LAB) LAB.fogAt(it.fw, ctx, W, H); it.draw(); }
    drawWind(snap.speed, snap.vx, snap.wind, dt);
    if (LAB) LAB.screen(lg, true);
    if (!fall || fall.impactT == null) drawHands(snap, dt);
    if (LAB) LAB.lensFx(lg);
    if (fall) drawFallFx(fall.lipY - eye.y);
    else if (sim.result && !sim.result.ok) { ctx.fillStyle = 'rgba(201,72,52,' + Math.min(0.35, endT * 0.5) + ')'; ctx.fillRect(0, 0, W, H); }
  }

  // 핸들과 두 손
  function drawHands(snap, dt) {
    const s = Math.min(W * 0.78, H * 1.45);
    const brake = phiDeg < -4 ? Math.min(1, (-phiDeg - 4) / 12) : 0;
    fp.bob += dt * (2 + snap.speed * 1.2);
    const bob = snap.grounded > 0 ? Math.sin(fp.bob) * Math.min(3, snap.speed * 0.25) : -4;
    const by = H * 0.9 + bob + fp.kick * H * 0.06;
    const cxh = W / 2;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // 앞바퀴 윗부분
    ctx.strokeStyle = '#1e1e1e'; ctx.lineWidth = s * 0.045;
    ctx.beginPath(); ctx.arc(cxh, by + s * 0.33, s * 0.2, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
    // 포크·스템
    ctx.strokeStyle = '#2b6cb0'; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); ctx.moveTo(cxh - s * 0.05, by + s * 0.2); ctx.lineTo(cxh - s * 0.02, by + s * 0.02); ctx.moveTo(cxh + s * 0.05, by + s * 0.2); ctx.lineTo(cxh + s * 0.02, by + s * 0.02); ctx.stroke();
    ctx.strokeStyle = '#333'; ctx.lineWidth = s * 0.035;
    ctx.beginPath(); ctx.moveTo(cxh, by + s * 0.03); ctx.lineTo(cxh, by - s * 0.02); ctx.stroke();
    // 핸들바
    const gx = s * 0.36, gy = by - s * 0.035;
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); ctx.moveTo(cxh - gx, gy); ctx.quadraticCurveTo(cxh, by - s * 0.06, cxh + gx, gy); ctx.stroke();
    // 브레이크 레버 (반대로 기울이면 당겨짐)
    ctx.strokeStyle = '#9aa3ad'; ctx.lineWidth = s * 0.012;
    for (const sd of [-1, 1]) {
      const x0 = cxh + sd * gx * 0.78, y0 = gy - s * 0.005;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + sd * s * 0.1, y0 - s * (0.06 - 0.045 * brake)); ctx.stroke();
    }
    // 종
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(cxh - gx * 0.45, gy - s * 0.02, s * 0.018, 0, Math.PI * 2); ctx.fill();
    // 팔과 장갑
    for (const sd of [-1, 1]) {
      const hx = cxh + sd * gx * 0.92, hy = gy;
      ctx.strokeStyle = '#e8553d'; ctx.lineWidth = s * 0.11;
      ctx.beginPath(); ctx.moveTo(cxh + sd * s * 0.62, H + s * 0.08); ctx.lineTo(hx + sd * s * 0.05, hy + s * 0.07); ctx.stroke();
      ctx.strokeStyle = '#f2c29b'; ctx.lineWidth = s * 0.075;
      ctx.beginPath(); ctx.moveTo(hx + sd * s * 0.05, hy + s * 0.07); ctx.lineTo(hx + sd * s * 0.015, hy + s * 0.025); ctx.stroke();
      ctx.fillStyle = '#26324a';
      ctx.beginPath(); ctx.ellipse(hx, hy, s * 0.06, s * 0.045, sd * 0.25, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = s * 0.006;
      for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(hx - s * 0.035 + k * 0.004 * s, hy - s * 0.02 + k * s * 0.02); ctx.lineTo(hx + s * 0.035, hy - s * 0.02 + k * s * 0.02); ctx.stroke(); }
    }
  }

  function drawCover(img) {
    // 화면을 꽉 채우게. 위쪽(하늘·헬멧)은 남기고 아래 풀밭을 잘라 내고, 좁은 화면에선 왼쪽 라이더 쪽을 보여 줌
    const r = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const w = img.naturalWidth * r, h = img.naturalHeight * r;
    const x = Math.min(0, Math.max(W - w, W / 2 - 0.26 * w));
    ctx.drawImage(img, x, 0, w, h);
  }
  function render(dt) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (!sim) { ctx.fillStyle = THEMES[0].sky0; ctx.fillRect(0, 0, W, H); return; }
    if (demo && IMG.title && IMG.title.complete && IMG.title.naturalWidth) { drawCover(IMG.title); return; }
    if (SET.view !== 'side' && !demo) { renderFP(dt); return; }
    const snap = sim.snapshot();
    const base = Math.max(22, Math.min(W / 18, H / 8.5));
    const kz = Math.min(1, snap.speed / 14);
    const targetS = base * (1 - 0.18 * kz);
    view.s += (targetS - view.s) * (1 - Math.exp(-dt / 0.5));
    const look = Math.max(-2, Math.min(4.5, snap.vx * 0.35));
    const tx = snap.x + 2.5 + look, ty = snap.y + 1.2 + (LAB && !snap.grounded ? Math.max(-3.5, Math.min(0, sim.chassis.getLinearVelocity().y * 0.3)) : 0);   // [실험실] 빨리 떨어지면 아래를 더 보여 줌
    view.x += (tx - view.x) * (1 - Math.exp(-dt / 0.18));
    view.y += (ty - view.y) * (1 - Math.exp(-dt / (fall ? 0.08 : 0.3)));
    drawBackground();
    ctx.save();
    if (view.shake > 0) { ctx.translate((Math.random() - 0.5) * view.shake, (Math.random() - 0.5) * view.shake); view.shake = Math.max(0, view.shake - dt * 40); }
    if (LAB && LAB.shake && !sim.result) view.shake = Math.max(view.shake, LAB.shake * 0.6);
    drawTerrain();
    const lg = LAB ? { ctx, sx, sy, s: view.s, sim, W, H, dt, left: view.x - W / 2 / view.s - 2, right: view.x + W / 2 / view.s + 2 } : null;
    if (LAB) LAB.sideTerrain(lg);
    drawProps(); drawBike(snap.speed);
    if (LAB) LAB.sideParticles(lg);
    ctx.restore();
    drawWind(snap.speed, snap.vx, snap.wind, dt);
    if (LAB) LAB.screen(lg, false);
    if (fall) drawFallFx(fall.lipY - sim.chassis.getPosition().y);
  }

  // ---------- 진단 ----------
  function diagLines() {
    const g = Input.g;
    const ori = (screen.orientation && screen.orientation.angle != null) ? screen.orientation.angle : (window.orientation != null ? window.orientation : '-');
    const raw = Input.rawDeg();
    return [
      T('dScreen') + ': ' + (inFrame ? T('dFrame') : T('dDirect')) + ' · ' + location.protocol.replace(':', ''),
      T('dPerm') + ': ' + Input.perm,
      T('dEvents') + ': ' + Input.events + T('times') + (Input.rate ? ' (' + Input.rate.toFixed(0) + '/s)' : ''),
      T('dRaw') + ': ' + (g ? [g.x, g.y, g.z].map(v => (v == null ? '-' : v.toFixed(2))).join(', ') : T('dNone')),
      T('dZero') + ': ' + (Input.g0 ? Input.g0.x.toFixed(2) + ', ' + Input.g0.y.toFixed(2) : T('dNotSet')),
      T('dOri') + ': ' + ori + '°',
      T('dTilt') + ': ' + raw.toFixed(1) + '°  →  ' + T('dGame') + ': ' + Input.gameDeg(raw).toFixed(1) + '°',
      T('dPitch') + ': ' + Input.pitchDeg().toFixed(1) + '°  →  ' + T('dGame') + ': ' + Input.pitchGame(Input.pitchDeg()).toFixed(1) + '° (' + T('viewFP') + ')',
      T('dDir') + ': ' + (SET.invert ? T('dInverted') : T('dNormal')) + ' · ' + T('inputLabel') + ': ' + (Input.mode === 'tilt' ? T('inputTilt') : Input.mode === 'touch' ? T('inputTouch') : Input.mode === 'keys' ? T('inputKeys') : '-')
    ];
  }
  let backTo = 'ovWorlds';
  function openDiag(from) { if (from) backTo = from; $('bInvert').textContent = T('invert') + ' (' + (SET.invert ? T('on') : T('off')) + ')'; show('ovDiag'); }

  // ---------- 설정 ----------
  function seg(id, opts, cur, onPick) {
    const el = $(id); el.innerHTML = '';
    for (const [val, label] of opts) { const b = document.createElement('button'); b.textContent = label; b.className = val === cur ? 'on' : ''; b.onclick = () => { A.SFX.click(); onPick(val); openSettings(); }; el.appendChild(b); }
  }
  let resetArmed = false;
  function openSettings(from) {
    if (from) backTo = from;
    seg('segSound', [[true, T('on')], [false, T('off')]], SET.sound, v => { SET.sound = v; A.set('sound', v); saveSet(); });
    seg('segMusic', [[true, T('on')], [false, T('off')]], SET.music, v => { SET.music = v; A.set('music', v); saveSet(); });
    seg('segVib', [[true, T('on')], [false, T('off')]], SET.vib, v => { SET.vib = v; saveSet(); });
    const inputs = isTouchDevice ? [['tilt', T('inputTilt')], ['touch', T('inputTouch')]] : [['keys', T('inputKeys')]];
    seg('segInput', inputs, Input.mode, v => { if (v === 'tilt') enableTilt(); else { Input.mode = v; SET.input = v; saveSet(); applyTexts(); } });
    seg('segLang', [['ko', '한국어'], ['en', 'English']], L.lang, v => { L.set(v); SET.lang = v; saveSet(); applyTexts(); });
    seg('segView', [['fp', T('viewFP') + ' · ' + T('recMobile')], ['side', T('viewSide') + ' · ' + T('recPC')]], SET.view === 'side' ? 'side' : 'fp', v => { SET.view = v; saveSet(); applyTexts(); });
    $('bRecalib').style.display = Input.mode === 'tilt' && SET.view === 'side' ? '' : 'none';
    $('bDiag').style.display = isTouchDevice ? '' : 'none';
    $('bReset').textContent = resetArmed ? T('resetConfirm') : T('resetProgress');
    show('ovSettings');
  }

  // ---------- 루프 ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    phiDeg = Input.update(dt);
    const blocked = $('ovPortrait').classList.contains('show') || (anyOverlay() && !demo);
    if (sim && demo) {
      // 타이틀 뒤 시연: 10°로 달리다 끝나면 다시
      const snap = sim.snapshot();
      phiDeg = sim.result ? 0 : (snap.x > 55 ? -8 : 10);
      if (!sim.result) sim.step(phiDeg * DEG, dt); else { endT += dt; if (endT > 1.5) startStage(0, { demo: true }); }
      sim.drainEvents();
    } else if (sim && playing && !blocked) {
      sim.step(phiDeg * DEG, dt);
      for (const ev of sim.drainEvents()) {
        if (ev.t === 'jump') A.SFX.jump();
        else if (ev.t === 'land') { A.SFX.land(ev.v); fp.kick = Math.min(1.5, ev.v / 6); if (ev.v > 5) vibrate(15); }
        else if (ev.t === 'gate') { A.SFX.gate(); vibrate(10); }
        else if (ev.t === 'bridge') A.SFX.bridge();
        else if (ev.t === 'crash') { if (ev.kind === 'gap' || ev.kind === 'cliff') { startFall(ev.kind); view.shake = 4; } else { A.SFX.crash(); vibrate([40, 30, 60]); view.shake = 10; } }
      }
      $('timer').textContent = sim.time.toFixed(1);
      if (sim.result) { endT = 0; playing = false; A.quiet(); }
      if (!sim.result && sim.backTime > 1.2 && !toastOn) setToast(T('backToast'), 4);
      A.update(sim.speed(), sim.grounded(), sim.windNow, dt);
      if (LAB) { LAB.update(sim, dt, SET.view !== 'side'); A.lab(LAB.surf, sim.speed(), sim.grounded() > 0, LAB.rain, dt); }
    } else if (sim && sim.result && !anyOverlay()) {
      sim.world.setGravity({ x: C.G * Math.sin(phiDeg * DEG), y: -C.G * Math.cos(phiDeg * DEG) });
      if (!(fall && fall.impactT != null)) sim.stepFree(dt);
      endT += dt;
      updateFall(dt);
      const done = sim.result.ok ? endT > 0.6 : fall ? (fall.impactT != null ? endT - fall.impactT > 1.0 : endT > 4) : endT > 1.2;
      if (done) { setToast(null); finish(); }
    }
    if (hintTimer > 0) { hintTimer -= dt; if (hintTimer <= 0) $('hint').style.opacity = 0; }
    if ($('ovDiag').classList.contains('show')) $('diagText').textContent = diagLines().join('\n');
    render(dt);
    requestAnimationFrame(frame);
  }

  // ---------- 시작 흐름 ----------
  function firstScreen() {
    if (!isTouchDevice) { Input.mode = 'keys'; SET.input = 'keys'; applyTexts(); openWorlds(); return; }
    if (SET.input === 'touch') { Input.mode = 'touch'; applyTexts(); openWorlds(); return; }
    if (SET.input === 'tilt' && !inFrame) { enableTilt(); return; }
    $('inBtns').style.display = '';
    $('bTilt').style.display = hasMotion ? '' : 'none';
    $('inNote').innerHTML = inFrame ? T('inFrameNote') : (location.protocol !== 'https:' && location.hostname !== 'localhost' ? T('httpsNote') : '');
    show('ovInput');
  }
  function pauseGame() {
    if (!sim || !playing || demo) return;
    paused = true; CG.gameplayStop(); A.quiet();
    show('ovPause');
  }
  function resumeGame() { if (!sim || !paused) return; paused = false; show(null); CG.gameplayStart(); last = performance.now(); }

  // ---------- 버튼 ----------
  const on = (id, fn) => { $(id).addEventListener('click', (e) => { A.ensure(); fn(e); }); };
  $('title').addEventListener('click', (e) => { if (e.target.closest('.tbtns')) return; A.ensure(); A.SFX.click(); firstScreen(); });
  on('bLang', () => { L.set(L.lang === 'ko' ? 'en' : 'ko'); SET.lang = L.lang; saveSet(); applyTexts(); });
  on('bTitleSet', () => { A.SFX.click(); openSettings('title'); });
  on('bTilt', () => { A.SFX.click(); enableTilt(); });
  on('bTouch', () => { A.SFX.click(); useTouch(); });
  on('bRetryTilt', () => enableTilt());
  on('bUseTouch', () => useTouch());
  on('bCalibGo', () => { Input.calibrate(); A.SFX.click(); if (backTo === 'ovDiag') { backTo = 'ovSettings'; openDiag(); } else if (sim && !sim.result && !demo && paused) { show('ovPause'); } else openWorlds(); });
  $('ovCalib').addEventListener('pointerup', (e) => { if (e.target.id !== 'bCalibGo') $('bCalibGo').click(); });
  on('bWorldsBack', () => openTitle());
  on('bWorldsSet', () => openSettings('ovWorlds'));
  on('bStagesBack', () => openWorlds());
  on('bSetBack', () => { resetArmed = false; if (backTo === 'title') openTitle(); else if (backTo === 'ovPause') show('ovPause'); else if (backTo === 'ovStages') openStages(curWorld); else openWorlds(); });
  on('bRecalib', () => { backTo = backTo === 'ovPause' ? 'ovPause' : 'ovSettings'; show('ovCalib'); });
  on('bDiag', () => openDiag('ovSettings'));
  on('bReset', () => { if (!resetArmed) { resetArmed = true; $('bReset').textContent = T('resetConfirm'); setTimeout(() => { resetArmed = false; if ($('ovSettings').classList.contains('show')) $('bReset').textContent = T('resetProgress'); }, 4000); return; } PROG = { stars: {}, best: {} }; saveProg(); resetArmed = false; setToast(T('resetDone'), 2); openSettings(); });
  on('bDiagCalib', () => { backTo = 'ovDiag'; show('ovCalib'); });
  on('bInvert', () => { SET.invert = !SET.invert; saveSet(); openDiag(); });
  on('bDiagClose', () => openSettings());
  on('bPortraitOk', () => { allowPortrait = true; resize(); });
  on('bRestart', () => { if (sim && !demo) { A.SFX.click(); withAdMaybe(() => startStage(stageIdx)); } });
  on('bPause', () => { A.SFX.click(); pauseGame(); });
  on('bView', () => { A.SFX.click(); SET.view = SET.view === 'side' ? 'fp' : 'side'; saveSet(); applyTexts(); });
  on('bResume', () => { A.SFX.click(); resumeGame(); });
  on('bPRestart', () => { A.SFX.click(); startStage(stageIdx); });
  on('bPList', () => { A.SFX.click(); openStages(worldOf(stageIdx)); });
  on('bPSet', () => { A.SFX.click(); openSettings('ovPause'); });
  on('bNext', () => { A.SFX.click(); withAd(() => startStage((stageIdx + 1) % C.stageCount)); });
  on('bAgain', () => { A.SFX.click(); withAd(() => startStage(stageIdx)); });
  on('bList', () => { A.SFX.click(); openStages(worldOf(stageIdx)); });
  function withAdMaybe(fn) { fn(); }   // 플레이 중 다시 하기는 광고 없음

  cv.addEventListener('pointerdown', e => { A.ensure(); if (LAB && Input.mode !== 'touch') doJump(); if (Input.mode === 'touch' && playing) { Input.touchX = e.clientX; try { cv.setPointerCapture(e.pointerId); } catch (_) { } } });
  cv.addEventListener('pointermove', e => { if (Input.mode === 'touch' && Input.touchX != null) Input.touchX = e.clientX; });
  const up = () => { Input.touchX = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { Input.keyR = true; e.preventDefault(); }
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { Input.keyL = true; e.preventDefault(); }
    if ((e.key === 'r' || e.key === 'R') && sim && !demo && !anyOverlay()) startStage(stageIdx);
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { if (paused) resumeGame(); else pauseGame(); }
    if ((e.key === 'v' || e.key === 'V') && !anyOverlay()) { SET.view = SET.view === 'side' ? 'fp' : 'side'; saveSet(); }
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
    if (LAB && (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') && !e.repeat) doJump();
    if ((e.key === 'Enter' || e.key === ' ') && current() === 'title') { A.ensure(); firstScreen(); }
  });
  window.addEventListener('keyup', e => {
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') Input.keyR = false;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') Input.keyL = false;
  });
  window.addEventListener('wheel', e => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', e => { if (!e.target.closest || !e.target.closest('.card')) e.preventDefault(); }, { passive: false });
  document.addEventListener('visibilitychange', () => { if (document.hidden && playing && !demo) pauseGame(); });
  window.addEventListener('blur', () => { if (playing && !demo) pauseGame(); });
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));

  // 그림 (있으면)
  function loadImages() {
    const list = [['title', 'img/title.webp'], ['bg0', 'img/bg_hills.webp'], ['bg1', 'img/bg_canyon.webp'], ['bg2', 'img/bg_storm.webp']];
    for (const [k, src] of list) { const im = new Image(); im.onload = () => { IMG[k] = im; }; im.onerror = () => { }; im.src = src; }
  }

  // 시험용
  if (TEST) {
    window.__tb = {
      Input, SET, get sim() { return sim; }, get PROG() { return PROG; }, startStage: (i) => startStage(i), openWorlds, openStages, openTitle, useTouch, openSettings, finish,
      setAngle(d) { Input.testAngle = d; },
      state() { return { playing, paused, demo, result: sim && sim.result, overlay: current(), phiDeg, stage: stageIdx, time: sim && sim.time }; },
      unlockAll() { window.__unlockAll = true; }, L, C, A, CG
    };
  }

  // ---------- 부팅 ----------
  (async () => {
    resize();
    applyTexts();
    A.set('sound', SET.sound); A.set('music', SET.music);
    CG.onMute(m => { CG.S.sdkMuted = m; A.setMuted(m); });
    await CG.init();
    CG.loadingStart();
    if (CG.active()) {
      // 계정 저장이 있으면 그걸로, 없으면 이 브라우저 기록을 올림
      try {
        const p = await CG.dataGet('tiltbike.prog');
        if (p) { PROG = Object.assign({ stars: {}, best: {} }, JSON.parse(p)); try { localStorage.setItem('tiltbike.prog', p); } catch (e) { } }
        else saveProg();
      } catch (e) { }
    }
    if (!TEST || window.__images) loadImages();
    CG.loadingStop();
    $('cover').classList.remove('show');
    openTitle();
    requestAnimationFrame(frame);
  })();
})();
