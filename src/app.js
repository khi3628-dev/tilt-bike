// 기울기 자전거 — 화면·입력·진행
(function () {
  const C = window.TiltCore, L = window.I18N, A = window.Audio2, CG = window.CG;
  const DEG = Math.PI / 180;
  const PAGES_URL = 'https://khi3628-dev.github.io/tilt-bike/';
  const DEAD = 3, MAXD = 25;
  const $ = id => document.getElementById(id);
  const inFrame = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
  const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  const hasMotion = typeof DeviceMotionEvent !== 'undefined';
  const TEST = location.hash === '#test';
  const IMG = {};                            // 그림 (있으면 씀)

  // ---------- 저장 ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('tiltbike.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('tiltbike.' + k, JSON.stringify(v)); } catch (e) { } CG.dataSet('tiltbike.' + k, JSON.stringify(v)); }
  };
  const SET = Object.assign({ sound: true, music: true, vib: true, input: null, invert: false, lang: null }, store.get('set', {}));
  let PROG = Object.assign({ stars: {}, best: {} }, store.get('prog', {}));
  const saveSet = () => store.set('set', SET);
  const saveProg = () => store.set('prog', PROG);

  // ---------- 언어 ----------
  L.set(SET.lang || ((navigator.language || 'en').toLowerCase().startsWith('ko') ? 'ko' : 'en'));
  const T = k => L.t(k);
  function applyTexts() {
    document.documentElement.lang = L.lang;
    document.title = T('title');
    $('titleH1').textContent = T('title'); $('tapToStart').textContent = T('tapToStart');
    $('inTitle').textContent = T('title'); $('inLine1').innerHTML = T('introLine1'); $('inLine2').innerHTML = T('introLine2');
    $('bTilt').textContent = T('startTilt'); $('bTouch').textContent = T('startTouch');
    $('sfTitle').textContent = T('sensorFailTitle'); $('bRetryTilt').textContent = T('retry'); $('bUseTouch').textContent = T('useTouch');
    $('calTitle').textContent = T('calibTitle'); $('calText').innerHTML = T('calibText'); $('bCalibGo').textContent = T('calibGo');
    $('worldsTitle').textContent = T('worlds'); $('bWorldsBack').textContent = T('back'); $('bWorldsSet').textContent = T('settings');
    $('stagesTitle').textContent = T('stages'); $('bStagesBack').textContent = T('back'); $('stagesNote').textContent = T('stars3');
    $('pauseTitle').textContent = T('pause'); $('bResume').textContent = T('resume'); $('bPRestart').textContent = T('restart'); $('bPList').textContent = T('toList'); $('bPSet').textContent = T('settings');
    $('bAgain').textContent = T('again'); $('bList').textContent = T('toList');
    $('setTitle').textContent = T('settings'); $('bSetBack').textContent = T('back');
    $('lblSound').textContent = T('sound'); $('lblMusic').textContent = T('music'); $('lblVib').textContent = T('vibrate'); $('lblInput').textContent = T('inputLabel'); $('lblLang').textContent = T('language');
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
    update(dt) {
      if (this.testAngle != null) return this.testAngle;
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
  const unlocked = i => TEST && window.__unlockAll ? true : (i === 0 || starsOf(i - 1) > 0);
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
  const curTheme = () => THEMES[sim ? sim.def.world : 0];

  function startStage(i, opts) {
    if (playing && !demo) CG.gameplayStop();   // 플레이 중 다시 하기: 먼저 끝냈다고 알림
    stageIdx = i;
    sim = new C.Sim(i);
    playing = true; paused = false; endT = 0; demo = !!(opts && opts.demo);
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
      A.music(sim.def.world);
      CG.gameplayStart();
    }
  }
  function setHint(text, sec) { $('hint').textContent = text; $('hint').style.opacity = 1; hintTimer = sec; }
  function setToast(text, sec) { toastOn = !!text; if (text) $('toast').textContent = text; $('toast').style.opacity = text ? 1 : 0; if (text && sec) setTimeout(() => { if ($('toast').textContent === text) setToast(null); }, sec * 1000); }
  function vibrate(ms) { if (SET.vib && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { } } }

  function openTitle() {
    playing = false; $('hud').style.display = 'none'; $('touchhint').style.opacity = 0;
    A.music(null); A.quiet();
    show('title');
    startStage(0, { demo: true });
  }
  function openWorlds() {
    playing = false; paused = false; $('hud').style.display = 'none'; $('touchhint').style.opacity = 0; A.quiet();
    CG.gameplayStop();
    const Lst = $('worldList'); Lst.innerHTML = '';
    C.WORLDS.forEach((w, wi) => {
      const b = document.createElement('button');
      const un = worldUnlocked(wi), ws = worldStars(wi), max = stageIdxOfWorld(wi).length * 3;
      b.className = 'tile world' + (un ? (ws === max ? ' done' : '') : ' locked');
      b.innerHTML = '<span class="n">' + (un ? ['🏡', '🏜️', '🏔️'][wi] : '🔒') + '</span><span class="wn">' + L.pick(w.name) + '</span><span class="ws">' + (un ? '★ ' + ws + '/' + max : T('locked')) + '</span>';
      b.onclick = () => { A.SFX.click(); if (!un) { setToast(T('lockedWorldToast'), 2); return; } openStages(wi); };
      Lst.appendChild(b);
    });
    $('worldsStars').textContent = '★ ' + totalStars() + '/' + (C.stageCount * 3);
    show('ovWorlds');
  }
  let curWorld = 0;
  function openStages(w) {
    curWorld = w; playing = false; paused = false; $('hud').style.display = 'none'; $('touchhint').style.opacity = 0; A.quiet();
    CG.gameplayStop();
    const Lst = $('stageList'); Lst.innerHTML = '';
    for (const i of stageIdxOfWorld(w)) {
      const d = C.STAGES[i](); const un = unlocked(i), st = starsOf(i);
      const b = document.createElement('button');
      b.className = 'tile' + (un ? (st ? ' done' : '') : ' locked');
      b.innerHTML = '<span class="n">' + (un ? d.id.split('-')[1] : '🔒') + '</span>' + L.pick(d.name) + '<span class="stars">' + (st ? '★'.repeat(st) + '☆'.repeat(3 - st) : '') + '</span>';
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
      $('resNums').innerHTML = '<span>' + T('time') + ' <b>' + t.toFixed(1) + 's</b>' + (isBest && best != null ? ' · ' + T('newBest') : '') + '</span><span>' + T('par') + ' <b>' + C.PAR[stageIdx].toFixed(1) + 's</b></span>';
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
    const img = IMG['bg' + (sim ? sim.def.world : 0)];
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
      const ytop = C.groundYAt(def.t.pieces, g.x0 - 0.3);
      const grd = ctx.createLinearGradient(0, sy(ytop), 0, sy(ytop - 6));
      grd.addColorStop(0, 'rgba(40,30,25,.0)'); grd.addColorStop(0.3, 'rgba(40,30,25,.85)'); grd.addColorStop(1, '#1b1410');
      ctx.fillStyle = grd; ctx.fillRect(sx(g.x0), sy(ytop), (g.x1 - g.x0) * view.s, H);
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
      const col = { rabbit: '#e07b00', turtle: '#2f8f4e', wind: '#3b82c4', stop: '#c94834' }[sg.kind];
      ctx.fillStyle = '#fff'; ctx.strokeStyle = col; ctx.lineWidth = 0.09 * s;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx - r, by - r, r * 2, r * 2, 0.15 * s) : ctx.rect(bx - r, by - r, r * 2, r * 2);
      ctx.fill(); ctx.stroke();
      ctx.font = Math.round(0.62 * s) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (sg.kind === 'wind') {
        ctx.save(); ctx.translate(bx, by + 0.03 * s); if (sg.dir < 0) ctx.scale(-1, 1); ctx.fillText('💨', 0, 0); ctx.restore();
      } else ctx.fillText({ rabbit: '🐇', turtle: '🐢', stop: '🛑' }[sg.kind], bx, by + 0.03 * s);
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
    const snap = sim.snapshot();
    const base = Math.max(22, Math.min(W / 18, H / 8.5));
    const kz = Math.min(1, snap.speed / 14);
    const targetS = base * (1 - 0.18 * kz);
    view.s += (targetS - view.s) * (1 - Math.exp(-dt / 0.5));
    const look = Math.max(-2, Math.min(4.5, snap.vx * 0.35));
    const tx = snap.x + 2.5 + look, ty = snap.y + 1.2;
    view.x += (tx - view.x) * (1 - Math.exp(-dt / 0.18));
    view.y += (ty - view.y) * (1 - Math.exp(-dt / 0.3));
    drawBackground();
    ctx.save();
    if (view.shake > 0) { ctx.translate((Math.random() - 0.5) * view.shake, (Math.random() - 0.5) * view.shake); view.shake = Math.max(0, view.shake - dt * 40); }
    drawTerrain(); drawProps(); drawBike(snap.speed);
    ctx.restore();
    drawWind(snap.speed, snap.vx, snap.wind, dt);
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
    $('bRecalib').style.display = Input.mode === 'tilt' ? '' : 'none';
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
        else if (ev.t === 'land') { A.SFX.land(ev.v); if (ev.v > 5) vibrate(15); }
        else if (ev.t === 'gate') { A.SFX.gate(); vibrate(10); }
        else if (ev.t === 'bridge') A.SFX.bridge();
        else if (ev.t === 'crash') { A.SFX.crash(); vibrate([40, 30, 60]); view.shake = 10; }
      }
      $('timer').textContent = sim.time.toFixed(1);
      if (sim.result) { endT = 0; playing = false; A.quiet(); }
      if (!sim.result && sim.backTime > 1.2 && !toastOn) setToast(T('backToast'), 4);
      A.update(sim.speed(), sim.grounded(), sim.windNow, dt);
    } else if (sim && sim.result && !anyOverlay()) {
      sim.world.setGravity({ x: C.G * Math.sin(phiDeg * DEG), y: -C.G * Math.cos(phiDeg * DEG) });
      sim.stepFree(dt);
      endT += dt;
      if (endT > (sim.result.ok ? 0.6 : 1.2)) { setToast(null); finish(); }
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
  on('bResume', () => { A.SFX.click(); resumeGame(); });
  on('bPRestart', () => { A.SFX.click(); startStage(stageIdx); });
  on('bPList', () => { A.SFX.click(); openStages(worldOf(stageIdx)); });
  on('bPSet', () => { A.SFX.click(); openSettings('ovPause'); });
  on('bNext', () => { A.SFX.click(); withAd(() => startStage((stageIdx + 1) % C.stageCount)); });
  on('bAgain', () => { A.SFX.click(); withAd(() => startStage(stageIdx)); });
  on('bList', () => { A.SFX.click(); openStages(worldOf(stageIdx)); });
  function withAdMaybe(fn) { fn(); }   // 플레이 중 다시 하기는 광고 없음

  cv.addEventListener('pointerdown', e => { A.ensure(); if (Input.mode === 'touch' && playing) { Input.touchX = e.clientX; try { cv.setPointerCapture(e.pointerId); } catch (_) { } } });
  cv.addEventListener('pointermove', e => { if (Input.mode === 'touch' && Input.touchX != null) Input.touchX = e.clientX; });
  const up = () => { Input.touchX = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { Input.keyR = true; e.preventDefault(); }
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { Input.keyL = true; e.preventDefault(); }
    if ((e.key === 'r' || e.key === 'R') && sim && !demo && !anyOverlay()) startStage(stageIdx);
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { if (paused) resumeGame(); else pauseGame(); }
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
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
