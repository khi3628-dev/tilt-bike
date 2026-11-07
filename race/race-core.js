// Fixie Drop 레이스 시험판 — 경주 규칙 (물리·코스·AI). 화면과 분리해 Node에서도 돌림
// 좌표: x = 코스를 따라 간 거리(m), y = 옆 위치(m, +가 오른쪽). 높이 h(x)는 코스 높낮이(경사로만 속도가 붙음)
(function (root) {
  const planck = root.planck || (typeof require !== 'undefined' ? require('planck') : null);
  const { Vec2, Box, Edge } = planck;
  const G = 12;                 // 게임 중력 (본편과 같음)
  const LANES = 5, LANE_W = 1.3, HALF = LANES * LANE_W / 2;
  const FINISH = 360;
  // 코스 높낮이: [길이, 경사(도)] — 출발대 → 언덕 2곳 → 결승
  const PROFILE = [[3, -6], [26, -17], [36, -3], [24, 6], [44, -10], [44, -3], [26, 7], [52, -12], [100, -2.5]];
  const CURVE = [[0, 0], [40, 0.012], [95, -0.012], [150, 0.013], [215, -0.013], [280, 0]];   // 좌우 굽이 (1/반지름). 굽은 곳에선 안쪽 레인이 짧음
  const DT = 1 / 120;
  const K_DRAG = 0.0036;        // 공기저항 (몸무게 1당)
  const CRR = 0.006;            // 구름 저항
  const LAT_V = 3.2;            // 좌우 이동 속도
  const DRAFT_LEN = 6, DRAFT_W = 0.8, DRAFT_MAX = 0.5;    // 바람막이: 앞사람 5m 안, 옆으로 0.8m 안이면 공기저항 최대 42% 줄어듦
  const MIN_V = 1.5;            // 안전장치: 부딪혀 거의 멈춰도 이 속도 밑으로는 안 떨어짐 (오르막에서 뒤로 굴러가지 않게)

  // 높이 표 (0.5m 간격, 이음매는 부드럽게)
  const H_STEP = 0.5, H = [], SL = [];
  (function buildProfile() {
    const segs = []; let x = 0;
    for (const [len, deg] of PROFILE) { segs.push({ x0: x, x1: x + len, deg }); x += len; }
    const total = x + 60, BL = 6;   // 경사 바뀌는 곳을 BL m에 걸쳐 섞음
    const degAt = (xx) => {
      let d = segs[segs.length - 1].deg;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (xx < s.x1) {
          d = s.deg;
          if (i + 1 < segs.length && xx > s.x1 - BL / 2) { const k = (xx - (s.x1 - BL / 2)) / BL; d = s.deg + (segs[i + 1].deg - s.deg) * k; }
          if (i > 0 && xx < s.x0 + BL / 2) { const k = (xx - (s.x0 - BL / 2)) / BL; d = segs[i - 1].deg + (s.deg - segs[i - 1].deg) * k; }
          break;
        }
      }
      return d;
    };
    let h = 0;
    for (let i = 0; i * H_STEP <= total; i++) { const xx = i * H_STEP, d = degAt(xx); SL.push(d * Math.PI / 180); H.push(h); h += Math.tan(d * Math.PI / 180) * H_STEP; }
  })();
  const sample = (arr, x) => { const u = Math.max(0, Math.min(arr.length - 1.001, x / H_STEP)), i = Math.floor(u), k = u - i; return arr[i] * (1 - k) + arr[i + 1] * k; };
  const heightAt = x => x < 0 ? H[0] : sample(H, x);
  const slopeAt = x => x < 0 ? 0 : sample(SL, x);
  const curveAt = x => { for (let i = CURVE.length - 1; i >= 0; i--) if (x >= CURVE[i][0]) return CURVE[i][1]; return 0; };

  const NAMES = [{ ko: '나', en: 'You' }, { ko: '번개', en: 'Bolt' }, { ko: '질풍', en: 'Gale' }, { ko: '로켓', en: 'Rocket' }, { ko: '돌쇠', en: 'Boulder' }];
  const COLORS = ['#e8553d', '#3b7dd8', '#2f9e57', '#9b59d0', '#e0a500'];
  // AI 성격: aim 바람막이 쫓는 정도, bump 일부러 밀치는 정도, react 판단 간격(초), wob 손 떨림
  const AI = [null,
    { aim: 0.9, bump: 0.2, react: 0.12, wob: 0.15, line: 0.7 },
    { aim: 0.7, bump: 0.05, react: 0.18, wob: 0.25, line: 0.9 },
    { aim: 0.8, bump: 0.5, react: 0.15, wob: 0.2, line: 0.5 },
    { aim: 0.5, bump: 0.8, react: 0.22, wob: 0.3, line: 0.3 }];

  function Race(opts) {
    opts = opts || {};
    const n = Math.min(LANES, opts.riders || 5);
    this.world = new planck.World({ gravity: Vec2(0, 0) });
    this.time = -3;        // 출발 신호 전 3초
    this.events = [];
    this.riders = [];
    this.finished = [];
    this.rng = mulberry(opts.seed || 1);
    const ground = this.world.createBody();
    ground.createFixture(Edge(Vec2(-60, -HALF), Vec2(FINISH + 120, -HALF)), { friction: 0.25, restitution: 0.25, userData: 'wall' });
    ground.createFixture(Edge(Vec2(-60, HALF), Vec2(FINISH + 120, HALF)), { friction: 0.25, restitution: 0.25, userData: 'wall' });
    const playerLane = opts.playerLane != null ? opts.playerLane : 2;
    const lanes = [playerLane, ...[0, 1, 2, 3, 4].filter(l => l !== playerLane)].slice(0, n);
    for (let i = 0; i < n; i++) {
      const b = this.world.createBody({ type: 'dynamic', position: Vec2(0, -HALF + LANE_W * (lanes[i] + 0.5)), angularDamping: 5, linearDamping: 0, bullet: true });
      b.createFixture(Box(0.85, 0.3), { density: 80 / (1.7 * 0.6), friction: 0.04, restitution: 0.45, userData: i });
      this.riders.push({ i, b, name: NAMES[i], color: COLORS[i], ai: i === 0 && !opts.autoPlayer ? null : (AI[i] || AI[1]), input: 0, aiT: 0, aiTy: b.getPosition().y, draft: 0, wob: 0, finish: null, bumpT: 0 });
    }
    this.mass = this.riders[0].b.getMass();
    this.world.on('post-solve', (c, imp) => {
      const a = c.getFixtureA().getUserData(), b = c.getFixtureB().getUserData();
      const J = imp.normalImpulses[0] || 0; if (J < 25) return;
      const ia = typeof a === 'number' ? a : null, ib = typeof b === 'number' ? b : null;
      const key = ia + ':' + ib; this.pairT = this.pairT || {}; if (this.time - (this.pairT[key] || -9) < 0.3) return; this.pairT[key] = this.time;   // 같은 쌍은 0.3초에 한 번
      const wm = c.getWorldManifold(null), p = wm && wm.points[0];
      this.events.push({ t: (ia != null && ib != null) ? 'bump' : 'wall', a: ia, b: ib, j: J, x: p ? p.x : 0, y: p ? p.y : 0 });
      for (const k of [ia, ib]) if (k != null) { const r = this.riders[k]; r.wob = Math.min(1, r.wob + J / 400); r.bumpT = 0.35; }
    });
  }
  function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  Race.prototype.step = function (dt, playerInput) {
    this.acc = (this.acc || 0) + Math.min(dt, 0.05);
    while (this.acc >= DT) { this.acc -= DT; this.fixed(playerInput); }
  };
  Race.prototype.fixed = function (playerInput) {
    const started = this.time >= 0;
    const R = this.riders;
    for (const r of R) {
      const b = r.b, p = b.getPosition(), v = b.getLinearVelocity(), m = this.mass;
      if (!started) { b.setLinearVelocity(Vec2(0, 0)); b.setAngularVelocity(0); continue; }   // 출발 문 닫힘
      // 바람막이: 바로 앞 선수
      let draft = 0;
      for (const o of R) { if (o === r) continue; const q = o.b.getPosition(), dx = q.x - p.x, dy = Math.abs(q.y - p.y); if (dx > 0.8 && dx < DRAFT_LEN && dy < DRAFT_W) draft = Math.max(draft, (1 - dx / DRAFT_LEN) * (1 - dy / DRAFT_W * 0.5)); }
      r.draft = draft;
      // 앞뒤: 경사 + 공기저항 + 구름 저항 (페달 없음)
      const th = slopeAt(p.x), sp = Math.max(0.01, Math.hypot(v.x, v.y));
      let fx = -m * G * Math.sin(th) - K_DRAG * m * (1 - DRAFT_MAX * draft) * v.x * sp - CRR * m * G * Math.sign(v.x);
      // 좌우: 입력 → 목표 옆 속도
      if (r.ai) this.think(r);
      else r.input = playerInput || 0;
      const shaky = r.wob > 0.05 ? (Math.sin(this.time * 23 + r.i) * r.wob * 1.2) : 0;
      const vyT = r.input * LAT_V + shaky, ctrl = r.bumpT > 0 ? 2 : 8;   // 부딪힌 직후엔 잠깐 조종이 덜 먹음
      const fy = m * Math.max(-7, Math.min(7, (vyT - v.y) * ctrl));   // 옆으로 미는 힘 상한 (서로 맞대고 갈아 멈추지 않게)
      b.applyForceToCenter(Vec2(fx, fy), true);
      r.vxPred = v.x + fx / m * DT;   // 충돌이 없었을 때의 앞 속도
      // 자세: 코스 방향으로 돌아옴 (부딪히면 잠깐 흔들림)
      const a = b.getAngle(), w = b.getAngularVelocity(), I = b.getInertia();
      b.applyTorque(-I * (30 * a + 6 * w), true);
      r.wob = Math.max(0, r.wob - DT * 0.9); r.bumpT = Math.max(0, r.bumpT - DT);
    }
    if (started) this.world.step(DT, 8, 3);
    for (const r of R) {
      // 굽은 곳: 바깥 레인은 같은 속도로 달려도 코스를 덜 나아감 (안쪽 길이 짧음). 굽이 c>0 = 오른쪽으로 굽음 → 오른쪽(+y)이 안쪽
      // 부딪혀서 생긴 앞쪽 속도 이득은 25%만 (옆으로 밀치기가 공짜 가속이 되지 않게)
      if (started && r.vxPred != null) { const v = r.b.getLinearVelocity(); if (v.x > r.vxPred + 0.02) r.b.setLinearVelocity(Vec2(r.vxPred + (v.x - r.vxPred) * 0.25, v.y)); }
      if (started) { const p = r.b.getPosition(), v = r.b.getLinearVelocity(), c = curveAt(p.x); if (c) r.b.setPosition(Vec2(p.x - v.x * DT * (-c * p.y) / (1 - c * p.y), p.y)); }
      const b = r.b, v = b.getLinearVelocity();
      if (started && v.x < MIN_V && r.finish == null) b.setLinearVelocity(Vec2(MIN_V, v.y));
      if (r.finish == null && b.getPosition().x >= FINISH) { r.finish = this.time; this.finished.push(r.i); this.events.push({ t: 'finish', i: r.i, place: this.finished.length }); }
    }
    this.time += DT;
  };
  // AI: 바람막이 뒤에 붙었다가, 가까워지면 빈 쪽으로 빠져 추월. 성격에 따라 옆 선수를 밀기도 함
  Race.prototype.think = function (r) {
    r.aiT -= DT; if (r.aiT > 0) { r.input = Math.abs(r.aiTy - r.b.getPosition().y) > 0.12 ? Math.sign(r.aiTy - r.b.getPosition().y) : 0; return; }
    r.aiT = r.ai.react * (0.7 + this.rng() * 0.6);
    const p = r.b.getPosition(), v = r.b.getLinearVelocity(), R = this.riders;
    let ty = p.y + (this.rng() - 0.5) * r.ai.wob;
    // 바로 앞 선수 찾기 (12m 안)
    let ahead = null, best = 1e9;
    for (const o of R) { if (o === r) continue; const q = o.b.getPosition(), dx = q.x - p.x; if (dx > 0.5 && dx < 12 && dx < best) { best = dx; ahead = o; } }
    if (ahead) {
      const q = ahead.b.getPosition(), qv = ahead.b.getLinearVelocity(), close = v.x - qv.x;
      if (best < 2.6 && close > 0.3) {   // 너무 가까움 → 빈 쪽으로 빠져 추월
        const side = [q.y - LANE_W, q.y + LANE_W].filter(y => Math.abs(y) < HALF - 0.45)
          .map(y => ({ y, free: R.every(o => o === r || Math.abs(o.b.getPosition().x - p.x) > 2.2 || Math.abs(o.b.getPosition().y - y) > 0.9) }))
          .sort((a1, b1) => (b1.free - a1.free) || (Math.abs(a1.y - p.y) - Math.abs(b1.y - p.y)));
        if (side.length) ty = side[0].y;
      } else if (this.rng() < r.ai.aim) ty = q.y;   // 바람막이 쫓기
    } else {
      const c = curveAt(p.x + v.x * 1.5);   // 앞에 아무도 없으면 굽은 곳 안쪽으로
      if (c && this.rng() < (r.ai.line || 0)) ty = Math.sign(c) * (HALF - 0.6);
    }
    // 밀치기: 옆에 바짝 붙은 선수 쪽으로
    if (this.rng() < r.ai.bump * 0.3) for (const o of R) { if (o === r) continue; const q = o.b.getPosition(); if (Math.abs(q.x - p.x) < 1.2 && Math.abs(q.y - p.y) < 1.6) { ty = q.y; break; } }
    ty = Math.max(-HALF + 0.45, Math.min(HALF - 0.45, ty));
    r.aiTy = ty;
    r.input = Math.abs(ty - p.y) > 0.12 ? Math.sign(ty - p.y) : 0;
  };
  Race.prototype.rank = function () {
    return this.riders.slice().sort((a, b) => (a.finish != null && b.finish != null) ? a.finish - b.finish : a.finish != null ? -1 : b.finish != null ? 1 : b.b.getPosition().x - a.b.getPosition().x);
  };
  Race.prototype.drain = function () { const e = this.events; this.events = []; return e; };

  const api = { Race, heightAt, slopeAt, curveAt, FINISH, LANES, LANE_W, HALF, NAMES, COLORS, G, DT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RaceCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
