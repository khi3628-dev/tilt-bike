// Fixie Drop 레이스 시험판 — 화면·조작·소리 (뒤에서 따라가는 3인칭)
(function () {
  const RC = window.RaceCore;
  const $ = id => document.getElementById(id);
  const cv = $('cv'), ctx = cv.getContext('2d');
  const KO = (navigator.language || 'ko').startsWith('ko');
  const T = (ko, en) => KO ? ko : en;
  let W = 0, H = 0, DPR = 1;
  function resize() { DPR = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * DPR; cv.height = H * DPR; cv.style.width = W + 'px'; cv.style.height = H + 'px'; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
  addEventListener('resize', resize); resize();

  // ---------- 소리 (WebAudio 합성) ----------
  const A = (() => {
    let ac = null, master, windG, windF, rollG, rollO, noise, muted = false;
    function ensure() {
      if (ac) { if (ac.state === 'suspended') ac.resume(); return true; }
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return false; }
      master = ac.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ac.destination);
      const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0); let last = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5 + w * 0.15; }
      noise = buf;
      const src = ac.createBufferSource(); src.buffer = noise; src.loop = true;
      windF = ac.createBiquadFilter(); windF.type = 'bandpass'; windF.frequency.value = 600; windF.Q.value = 0.5;
      windG = ac.createGain(); windG.gain.value = 0; src.connect(windF).connect(windG).connect(master); src.start();
      rollO = ac.createOscillator(); rollO.type = 'sawtooth'; rollO.frequency.value = 40;
      const rf = ac.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 220;
      rollG = ac.createGain(); rollG.gain.value = 0; rollO.connect(rf).connect(rollG).connect(master); rollO.start();
      return true;
    }
    function burst(dur, vol, freq, type, t0) {
      if (!ac) return; const t = t0 || ac.currentTime, s = ac.createBufferSource(); s.buffer = noise;
      const f = ac.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq || 800;
      const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f).connect(g).connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
    }
    function tone(f0, dur, type, vol, t0, f1) {
      if (!ac) return; const t = t0 || ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
    }
    return {
      ensure,
      setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.8; },
      get muted() { return muted; },
      update(sp, on) { if (!ac) return; const t = ac.currentTime; windG.gain.setTargetAtTime(on ? Math.min(0.5, sp * sp * 0.0016) : 0, t, 0.1); windF.frequency.setTargetAtTime(400 + sp * 60, t, 0.1); rollG.gain.setTargetAtTime(on ? Math.min(0.12, sp * 0.008) : 0, t, 0.1); rollO.frequency.setTargetAtTime(30 + sp * 4, t, 0.1); },
      bump(j) { if (!ac) return; const v = Math.min(1, j / 300); burst(0.18, 0.5 + v, 500, 'lowpass'); tone(110, 0.18, 'sine', 0.4 * v + 0.15, 0, 50); burst(0.06, 0.4 * v, 2500, 'bandpass'); },
      wall(j) { if (!ac) return; burst(0.3, 0.25 + Math.min(0.5, j / 400), 3000, 'highpass'); },
      beep(hi) { if (!ac) return; tone(hi ? 1320 : 660, hi ? 0.5 : 0.18, 'square', 0.12); },
      cheer() { if (!ac) return; const t = ac.currentTime; for (let k = 0; k < 6; k++) burst(1.4, 0.35, 1200 + Math.random() * 800, 'bandpass', t + k * 0.08); },
      finish(place) { if (!ac) return; const t = ac.currentTime; (place === 1 ? [523, 659, 784, 1047] : [523, 587, 659]).forEach((f, i) => tone(f, 0.25, 'triangle', 0.2, t + i * 0.1)); }
    };
  })();

  // ---------- 입력: ←/→ 또는 A/D, 폰은 화면 아래 ◀ ▶ (누르고 있기) ----------
  const keys = { L: false, R: false }, touch = { L: false, R: false };
  addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.L = true;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.R = true;
    if ((e.key === 'r' || e.key === 'R') && race) startRace();
    if ((e.key === ' ' || e.key === 'Enter') && !race) { e.preventDefault(); startRace(); }
  });
  addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.L = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.R = false;
  });
  for (const [id, k] of [['tL', 'L'], ['tR', 'R']]) {
    const el = $(id);
    el.addEventListener('pointerdown', e => { e.preventDefault(); touch[k] = true; el.classList.add('on'); A.ensure(); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => { touch[k] = false; el.classList.remove('on'); });
  }
  const inputNow = () => ((keys.R || touch.R) ? 1 : 0) - ((keys.L || touch.L) ? 1 : 0);

  // ---------- 경주 ----------
  let race = null, cam = null, shake = 0, flash = [], lastBeep = 99, sparks = [], finishedShown = false, seed = Date.now() % 100000;
  const BEST = 'fixierace.best';
  function startRace() {
    A.ensure();
    race = new RC.Race({ seed: seed++ });
    cam = { s: -8.5, l: race.riders[0].b.getPosition().y, pitch: 0 };
    shake = 0; flash = []; sparks = []; lastBeep = 99; finishedShown = false;
    $('ovStart').classList.remove('show'); $('ovResult').classList.remove('show'); $('hud').style.display = '';
    A.cheer();
  }
  $('bStart').onclick = startRace; $('bAgain').onclick = startRace;
  $('bMute').onclick = () => { A.ensure(); A.setMuted(!A.muted); $('bMute').textContent = A.muted ? '🔇' : '🔊'; };
  $('bRestart').onclick = () => startRace();

  // ---------- 그리기 ----------
  const WOOD = ['#c98b4f', '#bd7f45'], LANE_LINE = 'rgba(255,255,255,.75)', APRON = '#2f74c0', HALF = RC.HALF;
  const crowd = []; for (let k = 0; k < 900; k++) crowd.push({ s: Math.random() * (RC.FINISH + 80) - 20, side: Math.random() < 0.5 ? -1 : 1, z: 1.4 + Math.random() * 4.2, c: ['#e8553d', '#3b7dd8', '#ffd23f', '#2f9e57', '#ffffff', '#9b59d0', '#222'][k % 7], ph: Math.random() * 6 });
  function frameLateral(s0) {   // 카메라 기준 굽이 누적 (s0부터 앞뒤로 1m 간격)
    const N = 170, back = 12, X = new Float32Array(N + back);
    let h = 0, x = 0; X[back] = 0;
    for (let k = 1; k < N; k++) { const s = s0 + k; h += RC.curveAt(s) * 1; x += h; X[back + k] = x; }
    h = 0; x = 0; for (let k = 1; k <= back; k++) { const s = s0 - k; h -= RC.curveAt(s); x += h; X[back - k] = x; }
    return { X, back, s0 };
  }
  function draw(dt) {
    const me = race.riders[0], mp = me.b.getPosition(), mv = me.b.getLinearVelocity();
    // 카메라: 뒤 6m, 높이 2.3m, 옆은 천천히 따라감
    cam.s = mp.x - 8.5; cam.l += (mp.y * 0.8 - cam.l) * Math.min(1, dt * 4);
    const slope = RC.slopeAt(Math.max(0, mp.x)); cam.pitch += (slope - 0.12 - cam.pitch) * Math.min(1, dt * 3);
    const camY = RC.heightAt(Math.max(0, cam.s)) + 3.1, f = Math.min(W, H * 1.6) * 0.9, cx = W / 2, cy = H * 0.45;
    let shx = 0, shy = 0; if (shake > 0) { shx = (Math.random() - 0.5) * shake; shy = (Math.random() - 0.5) * shake; shake = Math.max(0, shake - dt * 40); }
    const LT = frameLateral(Math.floor(cam.s)), sBase = Math.floor(cam.s);
    const latAt = s => { const u = s - sBase + LT.back, i = Math.max(0, Math.min(LT.X.length - 2, Math.floor(u))), k = u - Math.floor(u); return LT.X[i] * (1 - k) + LT.X[i + 1] * k; };
    const tp = Math.tan(cam.pitch), latCam = latAt(cam.s);
    const proj = (s, l, z) => { const d = s - cam.s; if (d < 0.3) return null; const X = l + latAt(s) - latCam - cam.l, Y = RC.heightAt(Math.max(0, s)) + z - camY; return [cx + X * f / d + shx, cy - (Y / d - tp) * f + shy, d]; };
    // 하늘 + 먼 지붕
    const yh = cy + tp * f + shy;
    const gr = ctx.createLinearGradient(0, yh - H * 0.6, 0, yh); gr.addColorStop(0, '#5aa0e0'); gr.addColorStop(1, '#cfe6f7');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#7d8a99'; ctx.beginPath(); ctx.moveTo(0, yh - H * 0.05);
    for (let k = 0; k <= 12; k++) ctx.lineTo(W * k / 12, yh - H * (0.05 + 0.07 * Math.sin(k / 12 * Math.PI)));
    ctx.lineTo(W, yh + 2); ctx.lineTo(0, yh + 2); ctx.fill();
    ctx.fillStyle = '#fff8d0'; for (let k = 1; k < 12; k += 2) { ctx.beginPath(); ctx.arc(W * k / 12, yh - H * (0.06 + 0.07 * Math.sin(k / 12 * Math.PI)), 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#4a5a48'; ctx.fillRect(0, yh, W, H);
    // 코스 조각들 (먼 것부터)
    const items = [];
    const quad = (a, b, c, d, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.fill(); };
    for (let k = 0; k < 160; k++) {
      const ds = k < 40 ? 1 : 2, s0 = Math.floor(cam.s) + (k < 40 ? k : 40 + (k - 40) * 2), s1 = s0 + ds;
      if (s0 < -10 || s0 > RC.FINISH + 70) continue;
      const P = (s, l, z) => proj(s, l, z || 0);
      const a0 = P(s0, -HALF), a1 = P(s0, HALF), b0 = P(s1, -HALF), b1 = P(s1, HALF);
      if (!a0 || !a1 || !b0 || !b1) continue;
      items.push({ d: a0[2], draw() {
        const pl = Math.floor(s0 / 2) % 2;
        // 바깥: 관중석 → 광고판 → 파란 띠 → 나무 트랙 → 레인 선
        for (const sd of [-1, 1]) {
          const e = HALF + 0.7, w0 = P(s0, sd * e, 1.1), w1 = P(s1, sd * e, 1.1), g0 = P(s0, sd * e, 0), g1 = P(s1, sd * e, 0), t0 = P(s0, sd * (e + 7), 6), t1 = P(s1, sd * (e + 7), 6);
          if (t0 && t1 && w0 && w1) quad(w0, w1, t1, t0, pl ? '#5b6474' : '#535c6b');
          if (w0 && w1 && g0 && g1) quad(g0, g1, w1, w0, ['#e8553d', '#ffffff', '#3b7dd8', '#ffd23f'][Math.floor(s0 / 8) % 4]);
          const ap0 = P(s0, sd * HALF), ap1 = P(s1, sd * HALF);
          if (g0 && g1) quad(ap0, ap1, g1, g0, APRON);
        }
        quad(a0, a1, b1, b0, WOOD[pl]);
        for (let j = 1; j < RC.LANES; j++) { const l = -HALF + j * RC.LANE_W, c0 = P(s0, l - 0.04), c1 = P(s0, l + 0.04), e0 = P(s1, l - 0.04), e1 = P(s1, l + 0.04); if (c0 && c1 && e0 && e1) quad(c0, c1, e1, e0, j === 1 ? 'rgba(220,40,40,.8)' : j === 4 ? 'rgba(40,90,200,.8)' : LANE_LINE); }
        if (s0 <= RC.FINISH && s1 > RC.FINISH) for (let q = 0; q < 10; q++) { const l0 = -HALF + q * (2 * HALF / 10), l1 = l0 + 2 * HALF / 10; for (const [z0, sOff] of [[0, 0], [1, 0.5]]) { const p0 = P(RC.FINISH + sOff, l0), p1 = P(RC.FINISH + sOff, l1), p2 = P(RC.FINISH + sOff + 0.5, l1), p3 = P(RC.FINISH + sOff + 0.5, l0); if (p0 && p1 && p2 && p3) quad(p0, p1, p2, p3, (q + z0) % 2 ? '#111' : '#fff'); } }
        if (s0 <= 0 && s1 > 0) { const p0 = P(0, -HALF), p1 = P(0, HALF), p2 = P(0.3, HALF), p3 = P(0.3, -HALF); if (p0 && p1 && p2 && p3) quad(p0, p1, p2, p3, '#fff'); }
      } });
    }
    // 관중 (가까운 것만)
    for (const c of crowd) { const d = c.s - cam.s; if (d < 7 || d > 60) continue; const e = HALF + 0.7 + (c.z - 1.1) / 4.9 * 7; const P = proj(c.s, c.side * e, c.z + Math.max(0, Math.sin(performance.now() / 300 + c.ph)) * 0.15); if (!P) continue; items.push({ d: P[2] - 0.01, draw() { ctx.fillStyle = c.c; ctx.beginPath(); ctx.arc(P[0], P[1], Math.max(1, Math.min(5, 0.22 * f / P[2])), 0, Math.PI * 2); ctx.fill(); } }); }
    // 결승 아치
    { const L0 = proj(RC.FINISH, -HALF - 0.6, 0), L1 = proj(RC.FINISH, -HALF - 0.6, 4), R0 = proj(RC.FINISH, HALF + 0.6, 0), R1 = proj(RC.FINISH, HALF + 0.6, 4);
      if (L0 && L1 && R0 && R1) items.push({ d: L0[2] - 0.05, draw() { const k = f / L0[2]; ctx.strokeStyle = '#222'; ctx.lineWidth = Math.max(2, 0.25 * k); ctx.beginPath(); ctx.moveTo(L0[0], L0[1]); ctx.lineTo(L1[0], L1[1]); ctx.lineTo(R1[0], R1[1]); ctx.lineTo(R0[0], R0[1]); ctx.stroke(); ctx.fillStyle = '#e8553d'; ctx.fillRect(L1[0], L1[1], R1[0] - L1[0], Math.max(6, 0.9 * k)); ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.max(8, Math.round(0.6 * k)) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('FINISH', (L1[0] + R1[0]) / 2, L1[1] + Math.max(6, 0.9 * k) / 2); } }); }
    // 선수 (뒷모습)
    for (const r of race.riders) {
      const p = r.b.getPosition(), v = r.b.getLinearVelocity(), P = proj(p.x - 0.6, p.y, 0);
      if (!P || P[2] > 150) continue;
      items.push({ d: P[2] - 0.02, draw() { drawRider(P, 0.85 * f / P[2], r, v); } });
    }
    items.sort((a, b) => b.d - a.d);
    for (const it of items) it.draw();
    // 불꽃 (벽 긁힘)
    for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.t += dt; if (s.t > 0.4) { sparks.splice(i, 1); continue; } s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 900 * dt; ctx.fillStyle = 'rgba(255,' + (200 - s.t * 300 | 0) + ',80,' + (1 - s.t / 0.4) + ')'; ctx.fillRect(s.x, s.y, 3, 3); }
    // 속도선
    const sp = Math.hypot(mv.x, mv.y);
    if (sp > 11) { ctx.strokeStyle = 'rgba(255,255,255,' + Math.min(0.35, (sp - 11) * 0.05) + ')'; ctx.lineWidth = 2; ctx.beginPath(); for (let k = 0; k < 14; k++) { const a = Math.random() * Math.PI * 2, r0 = Math.min(W, H) * (0.42 + Math.random() * 0.2); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.6); ctx.lineTo(cx + Math.cos(a) * r0 * 1.25, cy + Math.sin(a) * r0 * 0.75); } ctx.stroke(); }
    // 부딪힘 글씨
    for (let i = flash.length - 1; i >= 0; i--) { const q = flash[i]; q.t += dt; if (q.t > 0.6) { flash.splice(i, 1); continue; } ctx.save(); ctx.globalAlpha = 1 - q.t / 0.6; ctx.font = 'bold ' + (28 + q.big * 18) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeText(q.text, q.x, q.y - q.t * 40); ctx.fillStyle = q.col; ctx.fillText(q.text, q.x, q.y - q.t * 40); ctx.restore(); }
  }
  function drawRider(P, k, r, v) {
    const x = P[0], y = P[1], lean = Math.max(-0.35, Math.min(0.35, -v.y * 0.08 + r.b.getAngle() * 0.8 + (r.wob ? Math.sin(performance.now() / 40) * r.wob * 0.15 : 0)));
    ctx.save(); ctx.translate(x, y); ctx.rotate(lean);
    const s = k; ctx.lineCap = 'round';
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(0, 0, 0.35 * s, 0.08 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1b1b1f'; ctx.fillRect(-0.04 * s, -0.68 * s, 0.08 * s, 0.68 * s);           // 뒷바퀴
    ctx.strokeStyle = '#555'; ctx.lineWidth = Math.max(1, 0.03 * s); ctx.beginPath(); ctx.moveTo(-0.28 * s, -1.0 * s); ctx.lineTo(0.28 * s, -1.0 * s); ctx.stroke();   // 핸들
    ctx.strokeStyle = '#2a2a30'; ctx.lineWidth = Math.max(2, 0.13 * s);                          // 다리
    const ph = performance.now() / 120 * (Math.hypot(v.x, v.y) > 1 ? 1 : 0) + r.i;
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sd * 0.11 * s, -0.95 * s); ctx.lineTo(sd * 0.13 * s, (-0.55 + Math.sin(ph + (sd > 0 ? Math.PI : 0)) * 0.12) * s); ctx.lineTo(sd * 0.1 * s, -0.25 * s); ctx.stroke(); }
    ctx.fillStyle = r.color; ctx.beginPath(); ctx.ellipse(0, -1.18 * s, 0.24 * s, 0.3 * s, 0, 0, Math.PI * 2); ctx.fill();   // 등
    ctx.strokeStyle = r.color; ctx.lineWidth = Math.max(2, 0.1 * s); for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sd * 0.18 * s, -1.3 * s); ctx.lineTo(sd * 0.27 * s, -1.0 * s); ctx.stroke(); }
    ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.max(6, Math.round(0.22 * s)) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(r.i + 1), 0, -1.18 * s);
    ctx.fillStyle = r.i === 0 ? '#ffffff' : '#ffd23f'; ctx.beginPath(); ctx.arc(0, -1.58 * s, 0.15 * s, Math.PI, 0); ctx.fill();   // 헬멧
    ctx.fillStyle = '#f2c29b'; ctx.fillRect(-0.09 * s, -1.56 * s, 0.18 * s, 0.1 * s);
    ctx.restore();
    if (r.i !== 0 && k > 6) { ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(15,29,43,.6)'; const nm = KO ? r.name.ko : r.name.en, tw = ctx.measureText(nm).width + 10; ctx.fillRect(x - tw / 2, y - 1.95 * k - 16, tw, 16); ctx.fillStyle = r.color; ctx.fillText(nm, x, y - 1.95 * k - 7); }
  }

  // ---------- HUD ----------
  const ord = n => KO ? n + '위' : n + (['st', 'nd', 'rd'][n - 1] || 'th');
  function hud() {
    const rk = race.rank(), me = race.riders[0], p = me.b.getPosition(), v = me.b.getLinearVelocity();
    const place = rk.indexOf(me) + 1;
    $('hPlace').textContent = ord(place) + ' / ' + race.riders.length;
    $('hTime').textContent = Math.max(0, me.finish != null ? me.finish : race.time).toFixed(1);
    $('hSpeed').textContent = Math.round(Math.hypot(v.x, v.y) * 3.6) + ' km/h';
    const bar = $('hBar'); bar.innerHTML = race.riders.map(r => '<i style="left:' + Math.max(0, Math.min(100, r.b.getPosition().x / RC.FINISH * 100)) + '%;background:' + r.color + (r.i === 0 ? ';width:12px;height:12px;top:-4px;border:2px solid #fff' : '') + '"></i>').join('');
    const c = RC.curveAt(p.x + v.x * 1.5), tips = [];
    if (me.draft > 0.2) tips.push('💨 ' + T('바람막이!', 'Drafting!'));
    if (c) tips.push((c > 0 ? '↱ ' : '↰ ') + T('굽은 길: ' + (c > 0 ? '오른쪽' : '왼쪽') + '이 안쪽', 'Bend: inside is ' + (c > 0 ? 'right' : 'left')));
    const sl = RC.slopeAt(p.x + 8); if (sl > 0.05) tips.push('⛰ ' + T('오르막', 'Uphill'));
    $('hTips').innerHTML = tips.map(t => '<span>' + t + '</span>').join('');
    if (race.time < 0) { const n = Math.ceil(-race.time); $('hCount').textContent = n; $('hCount').style.display = ''; if (n !== lastBeep) { lastBeep = n; A.beep(false); } }
    else if (race.time < 0.8) { $('hCount').textContent = T('출발!', 'GO!'); $('hCount').style.display = ''; if (lastBeep !== 0) { lastBeep = 0; A.beep(true); } }
    else $('hCount').style.display = 'none';
  }
  function showResult() {
    finishedShown = true;
    const me = race.riders[0], rk = race.rank(), place = rk.indexOf(me) + 1;
    let best = null; try { best = JSON.parse(localStorage.getItem(BEST)); } catch (e) { }
    const isBest = best == null || me.finish < best; if (isBest) try { localStorage.setItem(BEST, JSON.stringify(+me.finish.toFixed(2))); } catch (e) { }
    $('rTitle').textContent = place === 1 ? T('우승!', 'You win!') : ord(place);
    $('rIcon').textContent = place === 1 ? '🏆' : place <= 3 ? ['🥇', '🥈', '🥉'][place - 1] : '🏁';
    const t0 = rk[0].finish, est = r => { const p = r.b.getPosition(), v = r.b.getLinearVelocity(); return race.time + (RC.FINISH - p.x) / Math.max(2, v.x); };
    $('rTable').innerHTML = rk.map((r, k) => '<tr class="' + (r.i === 0 ? 'me' : '') + '"><td>' + (k + 1) + '</td><td><i style="background:' + r.color + '"></i>' + (KO ? r.name.ko : r.name.en) + '</td><td>' + (r.finish != null ? (k === 0 ? r.finish.toFixed(2) + 's' : '+' + (r.finish - t0).toFixed(2)) : '+~' + (est(r) - t0).toFixed(1)) + '</td></tr>').join('');
    $('rBest').textContent = T('내 최고 기록 ', 'Best ') + (isBest ? me.finish.toFixed(2) + 's ' + T('(새 기록!)', '(new!)') : best.toFixed(2) + 's');
    $('ovResult').classList.add('show');
    A.finish(place);
  }

  // ---------- 루프 ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (race) {
      race.step(dt, inputNow());
      for (const e of race.drain()) {
        if (e.t === 'bump' && (e.a === 0 || e.b === 0)) { A.bump(e.j); shake = Math.min(18, 4 + e.j / 25); flash.push({ text: T('쾅!', 'BUMP!'), x: W / 2 + (Math.random() - 0.5) * 120, y: H * 0.5, t: 0, col: '#ffd23f', big: Math.min(1, e.j / 300) }); if (navigator.vibrate) navigator.vibrate(30); }
        else if (e.t === 'bump') { const me = race.riders[0].b.getPosition(); if (Math.abs(e.x - me.x) < 25) A.bump(e.j * 0.4 / (1 + Math.abs(e.x - me.x) / 6)); }
        else if (e.t === 'wall' && (e.a === 0 || e.b === 0)) { A.wall(e.j); shake = Math.min(10, 3 + e.j / 40); const sx = W / 2 + (race.riders[0].b.getPosition().y > 0 ? 1 : -1) * W * 0.12; for (let k = 0; k < 14; k++) sparks.push({ x: sx, y: H * 0.72, vx: (Math.random() - 0.5) * 400, vy: -Math.random() * 300, t: 0 }); }
        else if (e.t === 'finish' && e.i === 0) A.cheer();
      }
      const me = race.riders[0], v = me.b.getLinearVelocity();
      A.update(Math.hypot(v.x, v.y), race.time > 0);
      draw(dt); hud();
      if (me.finish != null && !finishedShown && race.time > me.finish + 1.2) showResult();
      if (finishedShown && race.time < me.finish + 8) race.step(0, 0);
    } else drawIdle(dt);
    requestAnimationFrame(frame);
  }
  // 시작 화면 배경: 비어 있는 경기장을 천천히
  let idle = null;
  function drawIdle(dt) {
    if (!idle) { idle = new RC.Race({ seed: 7 }); idle.time = -10; }
    race = idle; if (!cam) cam = { s: -6, l: 0, pitch: 0 }; draw(dt); race = null;
  }
  requestAnimationFrame(frame);
  // 시험용
  window.__race = { get race() { return race; }, startRace, setSeed(s) { seed = s; }, keys, touch };
})();
