// 기울기 자전거 — 화면·입력
(function () {
  const C = window.TiltCore;
  const DEG = Math.PI / 180;
  const PAGES_URL = ''; // GitHub Pages 주소가 생기면 채움 (예: https://khi3628-dev.github.io/tilt-bike/)
  const DEAD = 3, MAXD = 25;               // ±3° 무시, 25°에서 최대
  const $ = id => document.getElementById(id);
  const inFrame = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();

  // ---------- 저장 (없어도 동작) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('tiltbike.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('tiltbike.' + k, JSON.stringify(v)); } catch (e) { } }
  };

  // ---------- 입력 ----------
  const Input = {
    mode: null,              // 'tilt' | 'touch'
    perm: '-', events: 0, firstAt: 0, lastAt: 0, rateN: 0, rateT: 0, rate: 0,
    g: null, g0: null, raw: 0, smooth: 0, invert: store.get('invert', false),
    touchX: null, touchAngle: 0, keyL: false, keyR: false, testAngle: null,
    onMotion(e) {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null) return;
      Input.g = { x: a.x, y: a.y, z: a.z };
      const now = performance.now();
      if (!Input.events) Input.firstAt = now;
      Input.events++; Input.lastAt = now; Input.rateN++;
      if (now - Input.rateT > 1000) { Input.rate = Input.rateN * 1000 / (now - Input.rateT); Input.rateN = 0; Input.rateT = now; }
    },
    calibrate() { if (this.g) { this.g0 = { x: this.g.x, y: this.g.y }; this.smooth = 0; this.raw = 0; } },
    // 0° 기준에서 화면 평면 안으로 얼마나 돌렸는지 (+ = 시계 방향 = 오른쪽이 내려감)
    rawDeg() {
      const g = this.g, g0 = this.g0;
      if (!g || !g0) return 0;
      const m = Math.hypot(g.x, g.y), m0 = Math.hypot(g0.x, g0.y);
      if (m < 2 || m0 < 2) return this.raw;   // 폰을 너무 눕히면 마지막 값 유지
      let a = Math.atan2(g0.x * g.y - g0.y * g.x, g0.x * g.x + g0.y * g.y) / DEG;
      return this.invert ? -a : a;
    },
    gameDeg(r) {
      const s = Math.sign(r), m = Math.abs(r);
      return s * Math.min(MAXD, Math.max(0, m - DEAD) * MAXD / (MAXD - DEAD));
    },
    // 프레임마다: 게임 기울기(도)
    update(dt) {
      if (this.testAngle != null) return this.testAngle;
      if (this.mode === 'tilt') {
        this.raw = this.rawDeg();
        this.smooth += (this.raw - this.smooth) * (1 - Math.exp(-dt / 0.06));
        return this.gameDeg(this.smooth);
      }
      // 화면 누르기 / 키보드: 누른 위치가 가운데에서 멀수록 많이 기울임
      let target = 0;
      if (this.touchX != null) {
        const w = window.innerWidth;
        target = Math.max(-1, Math.min(1, (this.touchX - w / 2) / (w * 0.32))) * MAXD;
      }
      if (this.keyR) target = MAXD;
      if (this.keyL) target = -MAXD;
      const rate = (this.touchX == null && !this.keyL && !this.keyR) ? 140 : 90;
      const d = target - this.touchAngle;
      this.touchAngle += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
      return this.touchAngle;
    }
  };

  async function enableTilt() {
    // iOS: 버튼을 누른 그 순간에 권한을 물어야 함
    let p = null;
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        p = DeviceMotionEvent.requestPermission();
      }
    } catch (e) { Input.perm = '요청 오류: ' + e.message; return sensorFail('perm'); }
    window.addEventListener('devicemotion', Input.onMotion);
    if (p) {
      try { const r = await p; Input.perm = r; if (r !== 'granted') return sensorFail('denied'); }
      catch (e) { Input.perm = '요청 오류: ' + (e && e.message || e); return sensorFail('perm'); }
    } else Input.perm = typeof DeviceMotionEvent === 'undefined' ? '센서 없음' : '물어볼 필요 없음';
    const t0 = performance.now(), n0 = Input.events;
    while (performance.now() - t0 < 1500 && Input.events === n0) await new Promise(r => setTimeout(r, 60));
    if (Input.events === n0) return sensorFail('silent');
    Input.mode = 'tilt';
    store.set('input', 'tilt');
    show('ovCalib');
  }

  function sensorFail(why) {
    const msg = {
      denied: '센서 권한이 허용되지 않았어요. Safari를 완전히 닫았다 다시 열고 "허용"을 눌러 주세요.',
      perm: '센서 권한을 물어보는 중에 오류가 났어요.',
      silent: '센서 신호가 들어오지 않아요.'
    }[why] || '';
    let html = msg;
    if (inFrame) html = '<span class="warn">지금 화면(claude.ai처럼 다른 페이지 안에 끼워진 화면)에서는 기울기 센서가 막혀 있어요.</span>' +
      (PAGES_URL ? '<br>Safari에서 이 주소를 직접 여세요:<br><a href="' + PAGES_URL + '" target="_blank" rel="noopener">' + PAGES_URL + '</a>' : '<br>지금은 "화면 누르기로 하기"로 해 보세요.');
    else if (location.protocol !== 'https:') html += '<br><span class="warn">https 주소에서만 센서를 쓸 수 있어요.</span>';
    $('failWhy').innerHTML = html;
    $('failDiag').textContent = diagLines().join('\n');
    show('ovSensorFail');
  }

  function useTouch() {
    Input.mode = 'touch';
    store.set('input', 'touch');
    openMenu();
  }

  // ---------- 화면 전환 ----------
  const OVS = ['ovTitle', 'ovSensorFail', 'ovCalib', 'ovMenu', 'ovResult', 'ovDiag'];
  function show(id) { for (const o of OVS) $(o).classList.toggle('show', o === id); }
  function anyOverlay() { return OVS.some(o => $(o).classList.contains('show')); }

  // ---------- 게임 상태 ----------
  let sim = null, stageIdx = 0, playing = false, endT = 0, phiDeg = 0, hintTimer = 0, toastOn = false;
  let done = store.get('done', []);
  const view = { x: 0, y: 0, s: 40, shake: 0 };

  function startStage(i) {
    stageIdx = i;
    sim = new C.Sim(i);
    playing = true; endT = 0;
    const snap = sim.snapshot();
    view.x = snap.x + 2; view.y = snap.y + 1;
    $('hud').style.display = 'flex';
    $('stageLabel').textContent = (i + 1) + ' · ' + sim.def.name;
    setHint(sim.def.hint, 5);
    setToast(null);
    $('touchhint').style.opacity = Input.mode === 'touch' ? 1 : 0;
    if (Input.mode === 'touch') setTimeout(() => { $('touchhint').style.opacity = 0; }, 6000);
    show(null);
  }
  function setHint(text, sec) { $('hint').textContent = text; $('hint').style.opacity = 1; hintTimer = sec; }
  function setToast(text) {
    toastOn = !!text;
    if (text) $('toast').textContent = text;
    $('toast').style.opacity = text ? 1 : 0;
  }

  function openMenu() {
    playing = false;
    const L = $('stageList'); L.innerHTML = '';
    for (let i = 0; i < C.stageCount; i++) {
      const name = C.STAGES[i]().name;
      const b = document.createElement('button');
      b.className = 'stage' + (done.includes(i) ? ' done' : '');
      b.innerHTML = '<span class="n">' + (i + 1) + (done.includes(i) ? ' ✓' : '') + '</span>' + name;
      b.onclick = () => startStage(i);
      L.appendChild(b);
    }
    $('bRecalib').style.display = Input.mode === 'tilt' ? '' : 'none';
    $('bSwitch').textContent = Input.mode === 'tilt' ? '화면 누르기로 바꾸기' : '기울기로 바꾸기';
    $('menuNote').textContent = Input.mode === 'tilt' ? '입력: 폰 기울기' : '입력: 화면 누르기 (오른쪽을 누를수록 내리막)';
    show('ovMenu');
  }

  function zoneOf(x) {
    const m = sim.def.t.marks;
    if (m.bumps && x > m.bumps.x - 3 && x < m.bumpsEnd.x + 3) return 'tunnel';
    return null;
  }

  function finish() {
    const r = sim.result;
    playing = false;
    const last = stageIdx === C.stageCount - 1;
    if (r.ok) {
      if (!done.includes(stageIdx)) { done.push(stageIdx); store.set('done', done); }
      $('resIcon').textContent = '🏁';
      $('resTitle').textContent = sim.def.stopZone ? '딱 멈췄어요! 완주!' : '완주!';
      $('resText').textContent = last ? '5판을 모두 깼어요. 기울기 손맛이 어땠는지 알려 주세요.' : '다음 판으로 가 볼까요?';
      $('bNext').textContent = last ? '1판부터 ▶' : '다음 판 ▶';
      $('bNext').style.display = '';
    } else {
      const x = sim.chassis.getPosition().x;
      let icon = '💥', title = '넘어졌어요', text = '다시 해 볼까요?';
      if (r.kind === 'gap') { icon = '🕳️'; title = '틈에 빠졌어요'; text = '토끼 표지판 앞에서는 더 기울여 빨리 오세요. 공중에서도 기울이면 더 멀리 날아가요.'; }
      else if (r.kind === 'cliff') { icon = '🪂'; title = '멈추지 못하고 떨어졌어요'; text = '노란 깃발 사이에서 폰을 반대로 기울여 멈추세요.'; }
      else if (r.kind === 'ceil') { icon = '🪨'; title = '바위에 머리를 박았어요'; text = '거북이 표지판 앞에서 반대로 기울여 천천히 들어가세요.'; }
      else if (zoneOf(x) === 'tunnel') { icon = '🐢'; title = '턱에서 튀어 고꾸라졌어요'; text = '거북이 표지판 앞에서 반대로 기울여 천천히 들어가세요.'; }
      else if (r.speed > 6) { title = '너무 빨라서 고꾸라졌어요'; text = '반대로 기울이면 속도가 줄어요.'; }
      $('resIcon').textContent = icon; $('resTitle').textContent = title; $('resText').textContent = text;
      $('bNext').style.display = 'none';
    }
    show('ovResult');
  }

  // ---------- 그리기 ----------
  const cv = $('cv'), ctx = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    $('ovPortrait').classList.toggle('show', isPortrait());
  }
  let allowPortrait = false;
  function isPortrait() {
    if (allowPortrait) return false;
    const touchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    return touchDevice && window.innerHeight > window.innerWidth * 1.05;
  }
  const sx = x => W / 2 + (x - view.x) * view.s;
  const sy = y => H / 2 - (y - view.y) * view.s;

  // 멀리 있는 산 (판마다 같은 모양)
  function hillLayer(seed, parallax, baseY, amp, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    const ext = Math.hypot(W, H);
    const step = 40;
    const off = view.x * view.s * parallax;
    ctx.moveTo(-ext, ext);
    for (let px = -ext; px <= ext; px += step) {
      const u = (px + off) / 260;
      const h = Math.sin(u * 1.3 + seed) * 0.6 + Math.sin(u * 2.9 + seed * 2) * 0.3 + Math.sin(u * 0.5 + seed * 3) * 0.5;
      ctx.lineTo(px, baseY - h * amp);
    }
    ctx.lineTo(ext, ext); ctx.closePath(); ctx.fill();
  }

  function drawBackground() {
    // 배경은 실제 수평을 유지: 폰을 φ만큼 시계 방향으로 돌리면 배경을 화면에서 반대로 φ 돌림
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-phiDeg * DEG);
    const ext = Math.hypot(W, H);
    const gr = ctx.createLinearGradient(0, -H / 2, 0, H / 2);
    gr.addColorStop(0, '#6fbfee'); gr.addColorStop(1, '#d9f1ff');
    ctx.fillStyle = gr; ctx.fillRect(-ext, -ext, ext * 2, ext * 2);
    ctx.fillStyle = 'rgba(255,246,190,.95)';
    ctx.beginPath(); ctx.arc(W * 0.28, -H * 0.28, Math.min(W, H) * 0.07, 0, Math.PI * 2); ctx.fill();
    hillLayer(1.7, 0.08, H * 0.12, 60, '#a9c8dc');
    hillLayer(4.1, 0.2, H * 0.26, 38, '#9ccaa5');
    // 지평선 (얇은 선) — 기울기를 볼 수 있게
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-ext, H * 0.12); ctx.lineTo(ext, H * 0.12); ctx.stroke();
    ctx.restore();
  }

  function drawTerrain() {
    const def = sim.def;
    const left = view.x - W / 2 / view.s - 2, right = view.x + W / 2 / view.s + 2;
    const bottom = view.y - H / 2 / view.s - 3;
    // 틈 아래 어두운 구덩이
    for (const g of def.gaps || []) {
      if (g.x1 < left || g.x0 > right) continue;
      const ytop = C.groundYAt(def.t.pieces, g.x0 - 0.3);
      const grd = ctx.createLinearGradient(0, sy(ytop), 0, sy(ytop - 6));
      grd.addColorStop(0, 'rgba(40,30,25,.0)'); grd.addColorStop(0.3, 'rgba(40,30,25,.85)'); grd.addColorStop(1, '#1b1410');
      ctx.fillStyle = grd;
      ctx.fillRect(sx(g.x0), sy(ytop), (g.x1 - g.x0) * view.s, H);
    }
    for (let pi = 0; pi < def.t.pieces.length; pi++) {
      let pc = def.t.pieces[pi];
      // 출발점 왼쪽도 땅이 이어져 보이게 (그림만)
      if (pi === 0 && pc.length) pc = [[pc[0][0] - 40, pc[0][1]]].concat(pc);
      if (pc.length < 2 || pc[pc.length - 1][0] < left || pc[0][0] > right) continue;
      let i0 = 0, i1 = pc.length - 1;
      while (i0 < i1 && pc[i0 + 1][0] < left) i0++;
      while (i1 > i0 && pc[i1 - 1][0] > right) i1--;
      const yb = Math.min(bottom, ...[pc[i0][1], pc[i1][1]].map(v => v - 2));
      ctx.beginPath();
      ctx.moveTo(sx(pc[i0][0]), sy(pc[i0][1]));
      for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(sx(pc[i][0]), sy(pc[i][1]));
      ctx.lineTo(sx(pc[i1][0]), sy(yb) + H); ctx.lineTo(sx(pc[i0][0]), sy(yb) + H); ctx.closePath();
      ctx.fillStyle = '#a77a4e'; ctx.fill();
      // 윗면: 진한 흙 띠 + 풀
      ctx.beginPath();
      ctx.moveTo(sx(pc[i0][0]), sy(pc[i0][1]));
      for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(sx(pc[i][0]), sy(pc[i][1]));
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = '#8a6240'; ctx.lineWidth = 0.55 * view.s; ctx.stroke();
      ctx.strokeStyle = '#4caf50'; ctx.lineWidth = 0.2 * view.s; ctx.stroke();
      ctx.strokeStyle = '#7fd67f'; ctx.lineWidth = 0.05 * view.s; ctx.stroke();
    }
    // 바위 천장
    for (const c of def.ceil) {
      if (c[c.length - 1][0] < left || c[0][0] > right) continue;
      const top = def.rockTop + 8;
      ctx.beginPath();
      ctx.moveTo(sx(c[0][0]), sy(top));
      for (const p of c) ctx.lineTo(sx(p[0]), sy(p[1]));
      ctx.lineTo(sx(c[c.length - 1][0]), sy(top)); ctx.closePath();
      ctx.fillStyle = '#6d5f57'; ctx.fill();
      ctx.strokeStyle = '#4a3f39'; ctx.lineWidth = 0.12 * view.s; ctx.stroke();
      // 바위 무늬
      ctx.fillStyle = 'rgba(0,0,0,.12)';
      for (let x = c[1][0]; x < c[c.length - 2][0]; x += 1.7) {
        ctx.beginPath(); ctx.arc(sx(x), sy(c[2][1] + 0.8 + ((x * 7.3) % 1) * 0.8), 0.25 * view.s, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawPole(x, h, color) {
    const gy = C.groundYAt(sim.def.t.pieces, x);
    if (gy == null) return null;
    ctx.strokeStyle = color || '#5b4636'; ctx.lineWidth = 0.08 * view.s;
    ctx.beginPath(); ctx.moveTo(sx(x), sy(gy)); ctx.lineTo(sx(x), sy(gy + h)); ctx.stroke();
    return gy;
  }
  function drawProps() {
    const def = sim.def, s = view.s;
    for (const sg of def.signs) {
      const gy = drawPole(sg.x, 1.5);
      if (gy == null) continue;
      const bx = sx(sg.x), by = sy(gy + 1.75), r = 0.48 * s;
      ctx.fillStyle = '#fff'; ctx.strokeStyle = sg.kind === 'rabbit' ? '#e07b00' : '#2f8f4e'; ctx.lineWidth = 0.09 * s;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx - r, by - r, r * 2, r * 2, 0.15 * s) : ctx.rect(bx - r, by - r, r * 2, r * 2);
      ctx.fill(); ctx.stroke();
      ctx.font = Math.round(0.62 * s) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(sg.kind === 'rabbit' ? '🐇' : '🐢', bx, by + 0.03 * s);
    }
    if (def.finish != null) {
      const gy = drawPole(def.finish, 2.3, '#333');
      if (gy != null) {
        const fx = sx(def.finish), fy = sy(gy + 2.3), cw = 0.2 * s;
        for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
          ctx.fillStyle = (r + c) % 2 ? '#111' : '#fff';
          ctx.fillRect(fx + c * cw, fy + r * cw, cw, cw);
        }
      }
    }
    if (def.stopZone) {
      const z = def.stopZone;
      ctx.beginPath();
      for (let x = z.x0; x <= z.x1 + 0.001; x += 0.25) {
        const y = C.groundYAt(def.t.pieces, x);
        x === z.x0 ? ctx.moveTo(sx(x), sy(y)) : ctx.lineTo(sx(x), sy(y));
      }
      ctx.strokeStyle = 'rgba(255,212,59,.95)'; ctx.lineWidth = 0.22 * s; ctx.stroke();
      for (const x of [z.x0, z.x1]) {
        const gy = drawPole(x, 2.0, '#333');
        ctx.fillStyle = '#ffd43b';
        ctx.beginPath(); ctx.moveTo(sx(x), sy(gy + 2.0)); ctx.lineTo(sx(x) + 0.7 * s, sy(gy + 1.8)); ctx.lineTo(sx(x), sy(gy + 1.6)); ctx.fill();
      }
      const mx = (z.x0 + z.x1) / 2, my = C.groundYAt(def.t.pieces, mx) + 2.6;
      ctx.font = 'bold ' + Math.round(0.45 * s) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(15,29,43,.75)';
      const tw = ctx.measureText('여기서 멈추기').width + 0.4 * s;
      ctx.fillRect(sx(mx) - tw / 2, sy(my) - 0.33 * s, tw, 0.66 * s);
      ctx.fillStyle = '#ffd43b'; ctx.fillText('여기서 멈추기', sx(mx), sy(my));
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
    const k = Math.min(1, Math.max(0, (speed - 3) / 10));     // 빠를수록 숙임
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // 바퀴
    for (const w of sim.wheels) {
      const p = w.body.getPosition(), a = w.body.getAngle();
      const cx = sx(p.x), cy = sy(p.y), r = C.R * s;
      const om = Math.abs(w.body.getAngularVelocity()) * C.R;
      ctx.strokeStyle = '#222'; ctx.lineWidth = 0.09 * s;
      ctx.beginPath(); ctx.arc(cx, cy, r - 0.045 * s, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = om > 7 ? 'rgba(90,90,90,.35)' : '#777'; ctx.lineWidth = 0.025 * s;
      for (let i = 0; i < 6; i++) {
        const t = -a + i * Math.PI / 3;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(t) * (r - 0.09 * s), cy + Math.sin(t) * (r - 0.09 * s)); ctx.stroke();
      }
      if (om > 7) { ctx.strokeStyle = 'rgba(120,120,120,.35)'; ctx.lineWidth = 0.12 * s; ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(cx, cy, 0.04 * s, 0, Math.PI * 2); ctx.fill();
    }
    const rw = sim.wheels[0].body.getPosition(), fw = sim.wheels[1].body.getPosition();
    const RA = [sx(rw.x), sy(rw.y)], FA = [sx(fw.x), sy(fw.y)];
    const BB = wp(-0.05, 0.14), SEAT = wp(-0.24, 0.56), HEAD = wp(0.38, 0.58), BAR = wp(0.44, 0.72);
    const fc = '#2b6cb0', fw2 = 0.07 * s;
    line(RA, BB, fw2, fc); line(RA, SEAT, fw2, fc); line(SEAT, BB, fw2, fc); line(BB, HEAD, fw2, fc); line(SEAT, HEAD, fw2, fc);
    line(HEAD, FA, fw2, fc); line(HEAD, BAR, 0.06 * s, '#333');
    line(wp(-0.34, 0.6), wp(-0.14, 0.6), 0.08 * s, '#222');   // 안장
    // 라이더 (빠를수록 몸을 숙임)
    const HIP = wp(-0.24, 0.66);
    const SH = wp(0.02 + 0.12 * k, 1.12 - 0.14 * k);
    const HD = wp(0.1 + 0.08 * k, 1.32 - 0.1 * k);
    const crank = 0.17;
    const F1 = wp(-0.05 + crank, 0.14), F2 = wp(-0.05 - crank, 0.14);
    const legL = 0.43 * s;
    // 뒤쪽 다리 → 몸 → 앞쪽 다리 순서
    const K2 = ik(HIP, F2, legL, legL, -1);
    line(HIP, K2, 0.1 * s, '#26324a'); line(K2, F2, 0.09 * s, '#26324a');
    line(HIP, SH, 0.2 * s, '#e8553d');
    const K1 = ik(HIP, F1, legL, legL, -1);
    line(HIP, K1, 0.11 * s, '#33415c'); line(K1, F1, 0.1 * s, '#33415c');
    const EL = ik(SH, BAR, 0.3 * s, 0.3 * s, 1);
    line(SH, EL, 0.08 * s, '#e8553d'); line(EL, BAR, 0.07 * s, '#f2c29b');
    // 머리 + 헬멧
    ctx.fillStyle = '#f2c29b'; ctx.beginPath(); ctx.arc(HD[0], HD[1], 0.15 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23f';
    const ang = -sim.chassis.getAngle();
    ctx.beginPath(); ctx.arc(HD[0], HD[1], 0.17 * s, Math.PI + ang - 0.2, ang + 0.25); ctx.closePath(); ctx.fill();
  }

  // 바람 줄기 (빠를수록 많이)
  const winds = Array.from({ length: 26 }, () => ({ x: Math.random(), y: Math.random(), l: 0.5 + Math.random() }));
  function drawWind(speed, vx, dt) {
    const a = Math.min(0.55, Math.max(0, (speed - 5) / 12));
    if (a <= 0) return;
    ctx.strokeStyle = 'rgba(255,255,255,' + a + ')'; ctx.lineWidth = 2;
    const n = Math.round(winds.length * Math.min(1, (speed - 4) / 10));
    for (let i = 0; i < n; i++) {
      const w = winds[i];
      w.x -= (vx * 1.4 * view.s * dt) / W;
      if (w.x < -0.2) { w.x = 1.1 + Math.random() * 0.2; w.y = Math.random(); }
      if (w.x > 1.3) { w.x = -0.1; w.y = Math.random(); }
      const len = w.l * speed * 4 * Math.sign(vx || 1);
      ctx.beginPath(); ctx.moveTo(w.x * W, w.y * H); ctx.lineTo(w.x * W + len, w.y * H); ctx.stroke();
    }
  }

  function render(dt) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (!sim) {
      phiDeg = 0;
      ctx.fillStyle = '#6fbfee'; ctx.fillRect(0, 0, W, H);
      return;
    }
    const snap = sim.snapshot();
    // 카메라: 진행 방향을 더 보여 주고, 빠르면 살짝 멀리
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
    drawTerrain();
    drawProps();
    drawBike(snap.speed);
    ctx.restore();
    drawWind(snap.speed, snap.vx, dt);
  }

  // ---------- 진단 ----------
  function diagLines() {
    const g = Input.g;
    const ori = (screen.orientation && screen.orientation.angle != null) ? screen.orientation.angle : (window.orientation != null ? window.orientation : '-');
    const raw = Input.rawDeg();
    return [
      '화면: ' + (inFrame ? '다른 페이지 안 (iframe)' : '직접 열림') + ' · ' + location.protocol.replace(':', ''),
      '권한: ' + Input.perm,
      '센서 신호: ' + Input.events + '번' + (Input.rate ? ' (' + Input.rate.toFixed(0) + '/초)' : ''),
      '원값 x,y,z: ' + (g ? [g.x, g.y, g.z].map(v => (v == null ? '-' : v.toFixed(2))).join(', ') : '없음'),
      '0° 기준: ' + (Input.g0 ? Input.g0.x.toFixed(2) + ', ' + Input.g0.y.toFixed(2) : '안 맞춤'),
      '화면 방향: ' + ori + '°',
      '기울인 각도: ' + raw.toFixed(1) + '°  →  게임 각도: ' + Input.gameDeg(raw).toFixed(1) + '°',
      '방향: ' + (Input.invert ? '반대로' : '보통') + ' · 입력: ' + (Input.mode === 'tilt' ? '기울기' : Input.mode === 'touch' ? '화면 누르기' : '-')
    ];
  }
  let diagFrom = null;
  function openDiag(from) {
    diagFrom = from;
    $('bInvert').textContent = '방향 반대로 (지금: ' + (Input.invert ? '반대' : '보통') + ')';
    show('ovDiag');
  }

  // ---------- 루프 ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    phiDeg = Input.update(dt);
    const paused = $('ovPortrait').classList.contains('show') || anyOverlay();
    if (sim && playing && !paused) {
      sim.step(phiDeg * DEG, dt);
      if (sim.result) {
        endT = 0;
        if (!sim.result.ok) view.shake = 10;
      }
      if (sim.result) playing = false;
      if (!sim.result && sim.backTime > 1.2 && !toastOn) setToast('뒤로 밀려요. 처음부터 다시 해 보세요 ↻');
      if (toastOn && sim.vx() > 0.5) setToast(null);
    } else if (sim && sim.result && !anyOverlay()) {
      // 끝난 뒤 1.2초는 넘어지는 모습을 보여 줌
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

  // ---------- 버튼·입력 연결 ----------
  $('bPortraitOk').onclick = () => { allowPortrait = true; resize(); };
  $('bTilt').onclick = () => enableTilt();
  $('bTouch').onclick = () => useTouch();
  $('bRetryTilt').onclick = () => enableTilt();
  $('bUseTouch').onclick = () => useTouch();
  $('bCalibGo').onclick = () => { Input.calibrate(); if (sim && !sim.result && diagFrom !== 'diag') startStage(stageIdx); else if (diagFrom === 'diag') { diagFrom = null; openDiag(null); } else openMenu(); };
  $('ovCalib').addEventListener('pointerup', (e) => { if (e.target.id !== 'bCalibGo') $('bCalibGo').click(); });
  $('bRecalib').onclick = () => { sim = null; show('ovCalib'); };
  $('bDiag').onclick = () => openDiag('menu');
  $('bDiagCalib').onclick = () => { Input.calibrate(); };
  $('bInvert').onclick = () => { Input.invert = !Input.invert; store.set('invert', Input.invert); openDiag(diagFrom); };
  $('bDiagClose').onclick = () => openMenu();
  $('bSwitch').onclick = () => { if (Input.mode === 'tilt') useTouch(); else enableTilt(); };
  $('bRestart').onclick = () => { if (sim) startStage(stageIdx); };
  $('bMenu').onclick = () => openMenu();
  $('bNext').onclick = () => startStage((stageIdx + 1) % C.stageCount);
  $('bAgain').onclick = () => startStage(stageIdx);
  $('bList').onclick = () => openMenu();

  cv.addEventListener('pointerdown', e => { if (Input.mode === 'touch') { Input.touchX = e.clientX; try { cv.setPointerCapture(e.pointerId); } catch (_) { } } });
  cv.addEventListener('pointermove', e => { if (Input.mode === 'touch' && Input.touchX != null) Input.touchX = e.clientX; });
  const up = () => { Input.touchX = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'd') Input.keyR = true;
    if (e.key === 'ArrowLeft' || e.key === 'a') Input.keyL = true;
    if (e.key === 'r' && sim) startStage(stageIdx);
  });
  window.addEventListener('keyup', e => {
    if (e.key === 'ArrowRight' || e.key === 'd') Input.keyR = false;
    if (e.key === 'ArrowLeft' || e.key === 'a') Input.keyL = false;
  });
  document.addEventListener('touchmove', e => { if (!e.target.closest || !e.target.closest('.card')) e.preventDefault(); }, { passive: false });
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));

  if (inFrame) $('titleNote').innerHTML = '이 화면(claude.ai)에서는 기울기 센서가 막혀 있어요. ' +
    (PAGES_URL ? '기울기로 하려면 Safari에서 <a href="' + PAGES_URL + '" target="_blank" rel="noopener">' + PAGES_URL + '</a>' : '"화면 누르기로 시작"을 눌러 주세요.');
  else if (location.protocol !== 'https:' && location.hostname !== 'localhost') $('titleNote').textContent = 'https 주소가 아니면 기울기 센서를 쓸 수 없어요.';

  // 시험용 (주소 끝 #test)
  if (location.hash === '#test') {
    window.__tb = {
      Input, get sim() { return sim; }, startStage, openMenu, useTouch,
      setAngle(d) { Input.testAngle = d; }, state() { return { playing, result: sim && sim.result, overlay: OVS.find(o => $(o).classList.contains('show')) || null, phiDeg }; }
    };
  }

  resize();
  requestAnimationFrame(frame);
})();
