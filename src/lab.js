// [실험실] 효과 실험: 바닥 재질·안개·비·돌풍·루프·점프의 그림과 화면 효과 (lab.html에만 들어감)
(function (root) {
  const C = root.TiltCore;
  if (!C) return;   // 실험실과 2.0 새 세계에서 씀
  const rnd = Math.random;
  const parts = [];            // 옆 시점: 월드 좌표 입자 (흙탕물, 얼음 가루, 돌먼지, 물보라)
  const lens = [];             // 1인칭: 화면(렌즈)에 붙는 물방울·흙탕물
  const spray = [];            // 1인칭: 화면 아래에서 튀어 오르는 입자
  const drops = Array.from({ length: 160 }, () => ({ x: rnd(), y: rnd(), l: 0.5 + rnd() * 0.9 }));
  let lastSim = null, shake = 0, surfNow = null, speedNow = 0, rainLevel = 0, fogState = null;
  const acc = { part: 0, lens: 0, spray: 0, ripple: 0 };
  const ripples = [];

  const surfAt = (def, x) => { for (const s of def.surfaces || []) if (x >= s.x0 && x <= s.x1) return s.type; return null; };
  const ROAD = { ice: ['#cfeefc', '#b4e0f4'], rock: ['#8e8984', '#7d7873'], mud: ['#5e3d23', '#52341e'], wet: ['#434b58', '#4a5361'] };
  const SIDE = { ice: ['#bfe8fb', '#ffffff'], rock: ['#86807a', '#5f5a55'], mud: ['#5a3920', '#7a5233'], wet: ['#3d4552', '#9fb3c8'] };

  function reset(sim) { parts.length = 0; lens.length = 0; spray.length = 0; ripples.length = 0; lastSim = sim; shake = 0; pops.length = 0; health = 100; }

  // ---------- 착지 판정 글씨 + 자전거 상태(데미지 미리보기, 이 판에서만) ----------
  const pops = []; let health = 100;
  const GRADE = { perfect: { ko: '완벽 착지!', en: 'Perfect landing!', col: '#ffd43b' }, good: { ko: '괜찮은 착지', en: 'Good landing', col: '#b9f3c4' }, bad: { ko: '나쁜 착지…', en: 'Bad landing…', col: '#ff9b8a' } };
  function onLand(ev, lang) {
    if (!ev.grade || !lastSim || !(lastSim.def.lab || lastSim.def.fx)) return;   // 글씨는 공중 조작이 되는 판에서만
    const g = GRADE[ev.grade];
    if (ev.grade === 'bad') health = Math.max(0, health - Math.round(10 + (ev.rel - 20) * 0.8));
    else if (ev.grade === 'good') health = Math.max(0, health - 3);
    pops.push({ text: g[lang === 'ko' ? 'ko' : 'en'] + (ev.grade === 'perfect' ? ' +💨' : ''), col: g.col, t: 0 });
  }
  function popsFx(g) {
    const { ctx, W, H, dt, sim } = g;
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i]; p.t += dt; if (p.t > 1.3) { pops.splice(i, 1); continue; }
      const k = Math.min(1, p.t / 0.12), a = Math.min(1, (1.3 - p.t) / 0.4), y = H * 0.32 - p.t * 30;
      ctx.save(); ctx.globalAlpha = a; ctx.font = 'bold ' + Math.round(26 + 8 * (1 - k)) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(15,29,43,.8)'; ctx.strokeText(p.text, W / 2, y); ctx.fillStyle = p.col; ctx.fillText(p.text, W / 2, y); ctx.restore();
    }
    if (C.IS_LAB && (sim.landings || health < 100)) {   // 자전거 상태 막대 (실험실 미리보기) (왼쪽 위, 판 이름 아래)
      const x = 12, y = 92, w = 130, h = 14;
      ctx.fillStyle = 'rgba(15,29,43,.55)'; ctx.fillRect(x, y - 3, w + 70, h + 6);
      ctx.fillStyle = '#2a3a4c'; ctx.fillRect(x + 26, y, w, h);
      ctx.fillStyle = health > 60 ? '#5ad17a' : health > 30 ? '#ffc43b' : '#ff6b5a'; ctx.fillRect(x + 26, y, w * health / 100, h);
      ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
      ctx.fillText('🔧', x + 4, y + h / 2 + 1); ctx.fillText(health + '%', x + 30 + w, y + h / 2 + 1);
    }
  }

  // ---------- 매 프레임: 상태와 입자 ----------
  function update(sim, dt, fp) {
    if (sim !== lastSim) reset(sim);
    const def = sim.def;
    const rw = sim.wheels[0].body.getPosition(), v = sim.chassis.getLinearVelocity();
    const sp = sim.speed(), gnd = sim.grounded();
    speedNow = sp;
    surfNow = gnd > 0 ? surfAt(def, rw.x) : null;
    rainLevel = def.env && def.env.rain ? def.env.rain : 0;
    shake = surfNow === 'rock' ? Math.min(6, sp * 0.45) : 0;
    const playing = !sim.result;
    // 입자 생성 (옆 시점용 월드 좌표)
    if (playing && surfNow && sp > 1.5) {
      const rate = { mud: 10 + sp * 9, ice: sp * 5, rock: sp * 3, wet: sp > 3 ? sp * 5 : 0 }[surfNow] || 0;
      acc.part += rate * dt;
      while (acc.part >= 1) {
        acc.part -= 1;
        const R = C.R, gx = rw.x - 0.1 + rnd() * 0.2, gy = rw.y - R + 0.03;
        if (surfNow === 'mud') parts.push({ x: gx, y: gy, vx: -v.x * (0.15 + rnd() * 0.3) + (rnd() - 0.5) * 1.5, vy: 1.5 + rnd() * sp * 0.45, r: 0.04 + rnd() * 0.09, life: 1.2, t: 0, g: 12, col: rnd() < 0.5 ? '#5a3920' : '#6e4a2c' });
        else if (surfNow === 'ice') parts.push({ x: gx, y: gy, vx: -v.x * 0.1 + (rnd() - 0.5), vy: 0.4 + rnd() * 1.2, r: 0.02 + rnd() * 0.03, life: 0.45, t: 0, g: 3, col: rnd() < 0.5 ? '#ffffff' : '#bfe8fb' });
        else if (surfNow === 'rock') parts.push({ x: gx, y: gy + 0.05, vx: -v.x * 0.15 + (rnd() - 0.5) * 0.6, vy: 0.3 + rnd() * 0.6, r: 0.08 + rnd() * 0.08, grow: 0.5, life: 0.7, t: 0, g: -0.5, col: 'rgba(150,140,128,.5)' });
        else parts.push({ x: gx, y: gy, vx: -v.x * 0.2 + (rnd() - 0.5) * 0.8, vy: 0.6 + rnd() * sp * 0.15, r: 0.02 + rnd() * 0.03, life: 0.5, t: 0, g: 10, col: 'rgba(200,220,240,.8)' });
      }
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.t += dt;
      if (p.t > p.life) { parts.splice(i, 1); continue; }
      p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.grow) p.r += p.grow * dt;
      const gy = C.groundYAt(def.t.pieces, p.x);
      if (gy != null && p.y < gy && p.g > 5) { p.y = gy; p.vx *= 0.3; p.vy = 0; p.g = 0; p.life = Math.min(p.life, p.t + 0.6); }
    }
    if (parts.length > 400) parts.splice(0, parts.length - 400);
    // 1인칭: 렌즈 흙탕물·빗방울, 아래 물보라
    if (fp && playing) {
      if (surfNow === 'mud' && sp > 3.5) { acc.lens += (sp - 3.5) * 0.45 * dt; }
      if (rainLevel) acc.lens += 1.6 * rainLevel * dt;
      while (acc.lens >= 1) {
        acc.lens -= 1;
        const mud = surfNow === 'mud' && sp > 3.5 && (!rainLevel || rnd() < 0.7);
        lens.push({ x: rnd(), y: mud ? 0.35 + rnd() * 0.6 : rnd() * 0.85, r: mud ? 0.018 + rnd() * 0.03 : 0.008 + rnd() * 0.018, t: 0, life: mud ? 3.5 + rnd() * 2 : 2.5 + rnd() * 2, mud, slide: rnd() * 0.03, seed: rnd() * 10 });
      }
      if (lens.length > 60) lens.splice(0, lens.length - 60);
      if (surfNow && sp > 2) {
        acc.spray += ({ mud: sp * 5, ice: sp * 4, rock: sp * 2, wet: sp * 3 }[surfNow] || 0) * dt;
        while (acc.spray >= 1) { acc.spray -= 1; spray.push({ x: 0.5 + (rnd() - 0.5) * 0.5, y: 1.02, vx: (rnd() - 0.5) * 0.6, vy: -(0.4 + rnd() * 0.5) * Math.min(1.6, sp / 8), r: surfNow === 'mud' ? 0.006 + rnd() * 0.012 : 0.003 + rnd() * 0.005, t: 0, life: 0.6, kind: surfNow }); }
      }
    }
    for (let i = lens.length - 1; i >= 0; i--) { const d = lens[i]; d.t += dt; d.y += d.slide * dt; if (d.t > d.life) lens.splice(i, 1); }
    for (let i = spray.length - 1; i >= 0; i--) { const p = spray[i]; p.t += dt; p.vy += 1.6 * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.t > p.life) spray.splice(i, 1); }
    if (spray.length > 200) spray.splice(0, spray.length - 200);
  }

  // ---------- 옆 시점 ----------
  function polyRange(pcs, x0, x1) {
    const out = [];
    for (const pc of pcs) for (const p of pc) if (p[0] >= x0 - 0.2 && p[0] <= x1 + 0.2) out.push(p);
    return out;
  }
  function sideTerrain(g) {
    const { ctx, sx, sy, s, sim, left, right } = g, def = sim.def;
    // 루프 (길 뒤에 기둥, 앞에 레일)
    for (const L of sim.loops) {
      if (L.x1 < left || L.x0 > right) continue;
      ctx.strokeStyle = '#5c6470'; ctx.lineWidth = 0.12 * s;
      for (let i = 0; i < L.path.length; i += 30) { const p = L.path[i]; if (p[1] > L.y0 + 0.8) { ctx.beginPath(); ctx.moveTo(sx(p[0]), sy(p[1])); ctx.lineTo(sx(p[0]), sy(L.y0)); ctx.stroke(); } }
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      const path = () => { ctx.beginPath(); ctx.moveTo(sx(L.path[0][0]), sy(L.path[0][1])); for (let i = 2; i < L.path.length; i += 2) ctx.lineTo(sx(L.path[i][0]), sy(L.path[i][1])); };
      path(); ctx.strokeStyle = '#2f3540'; ctx.lineWidth = 0.42 * s; ctx.stroke();
      path(); ctx.strokeStyle = '#e8553d'; ctx.lineWidth = 0.16 * s; ctx.stroke();
      path(); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 0.04 * s; ctx.stroke();
    }
    // 바닥 재질 띠
    for (const sf of def.surfaces || []) {
      if (sf.type === 'wet' || sf.x1 < left || sf.x0 > right) continue;
      const pts = polyRange(def.t.pieces, Math.max(sf.x0, left), Math.min(sf.x1, right));
      if (pts.length < 2) continue;
      const [c1, c2] = SIDE[sf.type];
      ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(sx(pts[0][0]), sy(pts[0][1])); for (const p of pts) ctx.lineTo(sx(p[0]), sy(p[1]));
      ctx.strokeStyle = c1; ctx.lineWidth = (sf.type === 'mud' ? 0.42 : 0.3) * s; ctx.stroke();
      if (sf.type === 'ice') { ctx.strokeStyle = c2; ctx.lineWidth = 0.05 * s; ctx.stroke(); }
      const x0 = Math.max(sf.x0, left), x1 = Math.min(sf.x1, right);
      for (let x = Math.ceil(x0 / 0.7) * 0.7; x < x1; x += 0.7) {
        const y = C.groundYAt(def.t.pieces, x); if (y == null) continue;
        const k = (Math.sin(x * 12.9898) * 43758.5453) % 1, kk = Math.abs(k);
        if (sf.type === 'rock') { ctx.fillStyle = kk < 0.5 ? c1 : c2; ctx.beginPath(); ctx.ellipse(sx(x), sy(y + 0.04), (0.1 + kk * 0.12) * s, (0.06 + kk * 0.06) * s, 0, 0, Math.PI * 2); ctx.fill(); }
        else if (sf.type === 'mud' && kk < 0.5) { ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.ellipse(sx(x), sy(y + 0.06), (0.2 + kk * 0.3) * s, 0.04 * s, 0, 0, Math.PI * 2); ctx.fill(); }
        else if (sf.type === 'ice' && kk < 0.35) { ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 0.03 * s; ctx.beginPath(); ctx.moveTo(sx(x - 0.15), sy(y + 0.09)); ctx.lineTo(sx(x + 0.15), sy(y + 0.12)); ctx.stroke(); }
      }
    }
    // 점프 상자
    for (const b of def.blocks || []) {
      if (b.x1 < left || b.x0 > right) continue;
      const X = sx(b.x0), Y = sy(b.y + b.h), w = (b.x1 - b.x0) * s, h = b.h * s;
      ctx.fillStyle = '#b07a3f'; ctx.fillRect(X, Y, w, h);
      ctx.strokeStyle = '#6e4720'; ctx.lineWidth = 0.06 * s; ctx.strokeRect(X, Y, w, h);
      ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + w, Y + h); ctx.moveTo(X + w, Y); ctx.lineTo(X, Y + h); ctx.stroke();
    }
    // 비: 바닥 물웅덩이 파문
    if (rainLevel) {
      acc.ripple += 14 * g.dt;
      while (acc.ripple >= 1) { acc.ripple -= 1; const x = left + rnd() * (right - left), y = C.groundYAt(def.t.pieces, x); if (y != null) ripples.push({ x, y, t: 0 }); }
      ctx.strokeStyle = 'rgba(220,235,255,.6)'; ctx.lineWidth = 1;
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i]; r.t += g.dt; if (r.t > 0.5) { ripples.splice(i, 1); continue; }
        ctx.globalAlpha = 1 - r.t / 0.5; ctx.beginPath(); ctx.ellipse(sx(r.x), sy(r.y) + 1, (0.05 + r.t * 0.6) * s, (0.02 + r.t * 0.12) * s, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
  function sideParticles(g) {
    const { ctx, sx, sy, s } = g;
    for (const p of parts) {
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), Math.max(1, p.r * s), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- 화면 효과 (두 시점 공통) ----------
  function rainFx(g, fp) {
    if (!rainLevel) return;
    const { ctx, W, H, dt } = g;
    ctx.fillStyle = 'rgba(20,30,48,.18)'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(210,225,245,.55)'; ctx.lineWidth = 1.2;
    const sp = speedNow;
    ctx.beginPath();
    for (const d of drops) {
      if (fp) {
        // 1인칭: 소실점에서 바깥으로 퍼지며 떨어짐
        const vx = (d.x - 0.5) * (0.4 + sp * 0.12), vy = 1.4 + sp * 0.05;
        d.x += vx * dt; d.y += vy * dt;
        if (d.y > 1.05 || d.x < -0.05 || d.x > 1.05) { d.x = 0.5 + (rnd() - 0.5) * 0.9; d.y = -0.05 + rnd() * 0.3; }
        const len = 0.025 * d.l * (1 + sp * 0.04);
        ctx.moveTo(d.x * W, d.y * H); ctx.lineTo((d.x + vx * len) * W, (d.y + vy * len) * H);
      } else {
        const vx = -0.15 - sp * 0.03, vy = 1.6;
        d.x += vx * dt; d.y += vy * dt;
        if (d.y > 1.05) { d.y = -0.05; d.x = rnd() * 1.3; }
        if (d.x < -0.1) d.x += 1.2;
        ctx.moveTo(d.x * W, d.y * H); ctx.lineTo((d.x + vx * 0.03 * d.l) * W, (d.y + vy * 0.03 * d.l) * H);
      }
    }
    ctx.stroke();
  }
  function fogSide(g) {
    const env = g.sim.def.env; if (!env || !env.fog) return;
    const { ctx, sx, sy, s, sim, W, H } = g, p = sim.chassis.getPosition();
    const X = sx(p.x + 1), Y = sy(p.y + 0.6), r0 = env.fog * 0.3 * s, r1 = env.fog * 0.95 * s;
    const gr = ctx.createRadialGradient(X, Y, r0, X, Y, r1);
    gr.addColorStop(0, 'rgba(222,228,234,.12)'); gr.addColorStop(1, 'rgba(222,228,234,.97)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  }
  function windGauge(g) {
    const { ctx, sim, W, H } = g; const w = sim.windNow || 0;
    if (!sim.def.winds.length || Math.abs(w) < 0.05) return;
    // 돌풍 세기 표시 (왼쪽 위, 판 이름 아래): ◀ = 맞바람, ▶ = 뒷바람
    const n = Math.max(1, Math.min(6, Math.round(Math.abs(w) / 1.0))), x = 12, y = 62;
    ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const txt = (w < 0 ? '💨 ' + '◀'.repeat(n) : '💨 ' + '▶'.repeat(n));
    ctx.fillStyle = 'rgba(15,29,43,.55)'; const tw = ctx.measureText(txt).width + 20; ctx.fillRect(x, y - 14, tw, 28);
    ctx.fillStyle = w < 0 ? '#ffb3a6' : '#b9f3c4'; ctx.fillText(txt, x + 10, y + 1);
  }
  function screen(g, fp) {
    if (!fp) fogSide(g);
    rainFx(g, fp);
    if (fp) {
      const { ctx, W, H } = g;
      for (const p of spray) {
        ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
        ctx.fillStyle = p.kind === 'mud' ? '#5a3920' : p.kind === 'rock' ? 'rgba(150,140,128,.6)' : p.kind === 'ice' ? '#e8f8ff' : 'rgba(210,225,245,.8)';
        ctx.beginPath(); ctx.arc(p.x * W, p.y * H, Math.max(1, p.r * W), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    windGauge(g);
    popsFx(g);
  }
  // 1인칭 렌즈 (손보다 위)
  function lensFx(g) {
    const { ctx, W, H } = g, S = Math.min(W, H);
    for (const d of lens) {
      const a = Math.min(1, (d.life - d.t) / 0.8) * Math.min(1, d.t / 0.06), x = d.x * W, y = d.y * H, r = d.r * S * 2.2;
      ctx.globalAlpha = a;
      if (d.mud) {
        // 흙탕물 얼룩: 둥근 덩어리 몇 개 + 작은 방울, 천천히 흘러내림
        for (let k = 0; k < 5; k++) {
          const t = d.seed + k * 2.39, ox = Math.cos(t) * r * 0.55 * (k ? 1 : 0), oy = Math.sin(t) * r * 0.45 * (k ? 1 : 0), rr = r * (k ? 0.35 + 0.25 * Math.abs(Math.sin(t * 1.7)) : 0.7);
          ctx.fillStyle = k ? 'rgba(92,60,32,.7)' : 'rgba(84,55,30,.78)'; ctx.beginPath(); ctx.arc(x + ox, y + oy, rr, 0, Math.PI * 2); ctx.fill();
        }
        for (let k = 0; k < 3; k++) { const t = d.seed * 3 + k * 2.1; ctx.beginPath(); ctx.arc(x + Math.cos(t) * r * 1.4, y + Math.sin(t) * r * 1.3, r * 0.12, 0, Math.PI * 2); ctx.fill(); }
        ctx.beginPath(); ctx.ellipse(x, y + r * 0.5 + d.t * r * 0.25, r * 0.12, r * (0.3 + d.t * 0.12), 0, 0, Math.PI * 2); ctx.fill();
      } else {
        const gr = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,.75)'); gr.addColorStop(0.6, 'rgba(200,220,240,.25)'); gr.addColorStop(1, 'rgba(120,140,170,.45)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(x, y, r * 0.85, r, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------- 1인칭 그리기 보탬 ----------
  function fpRoad(def, x, stripe) {
    const t = surfAt(def, x); if (!t) return null;
    return ROAD[t][stripe ? 0 : 1];
  }
  // 안개: 먼 것부터 그리다가 거리 문턱을 지날 때마다 안개색을 한 겹씩 덮음
  function fogBegin(def) {
    const f = def.env && def.env.fog;
    fogState = f ? { th: [3, 2.2, 1.6, 1.2, 0.9, 0.65, 0.45, 0.3].map(k => k * f), i: 0 } : null;
  }
  function fogAt(fw, ctx, W, H) {
    if (!fogState) return;
    while (fogState.i < fogState.th.length && fw < fogState.th[fogState.i]) { ctx.fillStyle = 'rgba(222,228,234,.3)'; ctx.fillRect(0, 0, W, H); fogState.i++; }
  }
  // 점프 상자 앞면, 루프 레일
  function fpItems(g) {
    const { ctx, sim, proj, lat, f, HW, rd } = g, def = sim.def, items = [];
    for (const b of def.blocks || []) {
      const l = lat(b.x0);
      const A = proj(b.x0, b.y, l - HW), B = proj(b.x0, b.y, l + HW), Cc = proj(b.x0, b.y + b.h, l + HW), D = proj(b.x0, b.y + b.h, l - HW);
      if (!A || !B || !Cc || !D) continue;
      items.push({ fw: A[2] - 0.02, draw() {
        ctx.fillStyle = '#b07a3f'; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(Cc[0], Cc[1]); ctx.lineTo(D[0], D[1]); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#6e4720'; ctx.lineWidth = Math.max(1, 0.06 * f / A[2]); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(Cc[0], Cc[1]); ctx.moveTo(B[0], B[1]); ctx.lineTo(D[0], D[1]); ctx.stroke();
      } });
    }
    for (const L of sim.loops) {
      const P = L.path, step = 4;
      for (let i = 0; i + step < P.length; i += step) {
        const a = P[i], b = P[i + step], la = lat(a[0]), lb = lat(b[0]);
        const A0 = proj(a[0], a[1], la - HW - 0.3), A1 = proj(a[0], a[1], la + HW + 0.3), B0 = proj(b[0], b[1], lb - HW - 0.3), B1 = proj(b[0], b[1], lb + HW + 0.3);
        if (!A0 || !A1 || !B0 || !B1) continue;
        const a0 = proj(a[0], a[1], la - HW), a1 = proj(a[0], a[1], la + HW), b0 = proj(b[0], b[1], lb - HW), b1 = proj(b[0], b[1], lb + HW);
        const stripe = Math.floor(i / 24) % 2 === 0;
        items.push({ fw: (A0[2] + B0[2]) / 2, draw() {
          const q = (p, q1, r, s1, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q1[0], q1[1]); ctx.lineTo(r[0], r[1]); ctx.lineTo(s1[0], s1[1]); ctx.closePath(); ctx.fill(); };
          q(A0, A1, B1, B0, stripe ? '#e8553d' : '#ffffff');
          q(a0, a1, b1, b0, stripe ? '#3a4250' : '#424b5a');
          if (stripe) q(proj(a[0], a[1], la - 0.06) || a0, proj(a[0], a[1], la + 0.06) || a1, proj(b[0], b[1], lb + 0.06) || b1, proj(b[0], b[1], lb - 0.06) || b0, '#ffd43b');
        } });
      }
    }
    return items;
  }

  // ---------- 점프 버튼 ----------
  let jumpBtn = null, jumpFn = null;
  function jumpButton(show, onJump) {
    if (onJump) jumpFn = onJump;
    if (!jumpBtn) {
      jumpBtn = document.createElement('button');
      jumpBtn.textContent = '⤴'; jumpBtn.setAttribute('aria-label', 'jump');
      jumpBtn.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(46px + env(safe-area-inset-bottom));width:86px;height:86px;border-radius:50%;border:3px solid rgba(255,255,255,.85);background:rgba(232,85,61,.75);color:#fff;font-size:40px;font-weight:800;z-index:6;touch-action:none;display:none;';
      jumpBtn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (jumpFn) jumpFn(); });
      document.body.appendChild(jumpBtn);
    }
    jumpBtn.style.display = show ? 'block' : 'none';
  }

  root.Lab = {
    update, reset, onLand, sideTerrain, sideParticles, screen, lensFx, fpRoad, fogBegin, fogAt, fpItems, jumpButton,
    get shake() { return shake; }, get surf() { return surfNow; }, get rain() { return rainLevel; }, get speed() { return speedNow; }
  };
})(window);
