// 기울기 자전거 — 물리 코어 (브라우저·Node 공용)
// 폰 기울기 φ(라디안, +면 오른쪽이 내려감) = 게임 중력을 φ만큼 돌림 → 길이 내리막/오르막이 됨.
(function (root) {
  const planck = (typeof module !== 'undefined' && module.exports) ? require('planck') : root.planck;
  const { Vec2, Chain, Edge, Circle, Polygon, Box, WheelJoint } = planck;

  const G = 12;              // 게임 중력 (m/s²)
  const DT = 1 / 120;        // 물리 고정 간격
  const MAX_TILT = 25 * Math.PI / 180;
  const R = 0.34;            // 바퀴 반지름
  const VT = 15;             // 최대 경사(25°) 평지에서의 끝 속도 목표 (공기 저항 계수 계산용)
  const CRR = 0.02;          // 구름 저항 (경사 약 1.1°에 해당)

  // ---------- 지형 만들기 ----------
  function Terrain(x, y) {
    this.pieces = [[[x, y]]];
    this.x = x; this.y = y; this.a = 0;
    this.marks = {};
  }
  // len m 동안 경사를 deg로 바꿔 가며 이어 그림 (처음 blend m 동안 부드럽게 바뀜)
  Terrain.prototype.go = function (len, deg, blend) {
    const a0 = this.a, a1 = deg * Math.PI / 180;
    blend = Math.min(blend == null ? 3 : blend, len);
    const n = Math.max(1, Math.ceil(len / 0.4));
    const ds = len / n;
    const cur = this.pieces[this.pieces.length - 1];
    for (let i = 1; i <= n; i++) {
      const s = (i - 0.5) * ds;
      const t = blend > 0 && s < blend ? 0.5 - 0.5 * Math.cos(Math.PI * s / blend) : 1;
      const a = a0 + (a1 - a0) * t;
      this.x += ds * Math.cos(a); this.y += ds * Math.sin(a);
      cur.push([this.x, this.y]);
    }
    this.a = a1;
    return this;
  };
  // 둔덕 n개 (폭 w, 높이 h), 평지 기준
  Terrain.prototype.bumps = function (n, w, h) {
    const cur = this.pieces[this.pieces.length - 1];
    const base = this.y, x0 = this.x;
    const m = Math.ceil(w / 0.25);
    for (let k = 0; k < n; k++) {
      for (let i = 1; i <= m; i++) {
        const u = i / m;
        cur.push([x0 + (k + u) * w, base + h * 0.5 * (1 - Math.cos(2 * Math.PI * u))]);
      }
    }
    this.x = x0 + n * w; this.y = base; this.a = 0;
    return this;
  };
  // 솟은 턱: 오르막 up m로 h만큼 오르고, 윗면 top m, 내리막 down m (평지 기준)
  Terrain.prototype.kicker = function (h, up, top, down, blend) {
    blend = blend == null ? 0.5 : blend;
    this.go(Math.hypot(up, h), Math.atan2(h, up) * 180 / Math.PI, blend);
    this.go(top, 0, blend);
    this.go(Math.hypot(down, h), -Math.atan2(h, down) * 180 / Math.PI, blend);
    return this.go(0.6, 0, blend);
  };
  // 틈: 지금 땅을 끝내고 len m 뒤, dy 아래(+면 위)에서 새 땅 시작
  Terrain.prototype.gap = function (len, dy) {
    this.x += len; this.y += dy;
    this.pieces.push([[this.x, this.y]]);
    return this;
  };
  Terrain.prototype.mark = function (name) { this.marks[name] = { x: this.x, y: this.y }; return this; };

  // ---------- 판 5개 ----------
  function stage1() {
    const t = new Terrain(0, 0);
    t.go(10, 0).mark('slope').go(26, -6, 4).go(40, 0, 4).mark('end');
    return {
      name: '첫 내리막', hint: '폰 오른쪽을 내리면 내리막이 돼요. 깃발까지 가 보세요.',
      t, start: 3, finish: t.marks.end.x - 10, signs: [], ceil: []
    };
  }
  function stage2() {
    const t = new Terrain(0, 0);
    t.go(8, 0).go(30, -12, 4).go(4, 0, 3).mark('hill').go(11, 33, 3).mark('top').go(26, 0, 5).mark('end');
    return {
      name: '높은 오르막', hint: '가파른 오르막은 기울기만으론 못 올라가요. 내리막에서 속도를 모아 오세요.',
      t, start: 3, finish: t.marks.end.x - 8, signs: [], ceil: []
    };
  }
  function stage3() {
    const t = new Terrain(0, 0);
    t.go(6, 0).go(26, -10, 4).go(9, 0, 3).mark('sign').go(4.5, 16, 2.5).mark('lip')
      .gap(7.5, -2.2).go(18, -12, 0).go(30, 0, 5).mark('end');
    return {
      name: '틈 점프', hint: '토끼 표지판: 빨리 와야 틈을 넘어요.',
      t, start: 3, finish: t.marks.end.x - 8,
      signs: [{ x: t.marks.sign.x - 7, kind: 'rabbit' }], ceil: [], gaps: [{ x0: t.marks.lip.x, x1: t.marks.lip.x + 7.5 }]
    };
  }
  function stage4() {
    const t = new Terrain(0, 0);
    t.go(6, 0).go(22, -14, 4).go(14, 0, 4).mark('bumps');
    for (let i = 0; i < 3; i++) t.kicker(0.5, 1.3, 0.5, 1.3).go(2.5, 0, 0.3);
    t.mark('bumpsEnd').go(18, 0, 0).mark('end');
    const b = t.marks.bumps, e = t.marks.bumpsEnd;
    const H = 2.6; // 천장 높이 (턱 바닥 기준)
    const ceil = [[b.x - 3, b.y + H + 2.5], [b.x - 1.2, b.y + H + 0.3], [b.x, b.y + H], [e.x, e.y + H], [e.x + 1.2, e.y + H + 0.3], [e.x + 3, e.y + H + 2.5]];
    return {
      name: '둔덕 터널', hint: '거북이 표지판: 천천히! 빠르면 둔덕에서 튀어 바위에 머리를 박아요.',
      t, start: 3, finish: t.marks.end.x - 8,
      signs: [{ x: b.x - 12, kind: 'turtle' }], ceil: [ceil], rockTop: b.y + H + 6
    };
  }
  function stage5() {
    const t = new Terrain(0, 0);
    t.go(6, 0).go(18, -10, 4).go(14, 0, 4).mark('bumps');
    for (let i = 0; i < 2; i++) t.kicker(0.5, 1.3, 0.5, 1.3).go(2.5, 0, 0.3);
    t.mark('bumpsEnd')
      .go(6, 0, 0).go(14, -9, 3).go(5, 0, 2).mark('kick').go(4.5, 16, 2.5).mark('lip')
      .gap(6.5, -2.0).go(16, -12, 0).go(8, 0, 4).go(9, 6, 3).mark('plateau').go(16, 0, 3).mark('cliff');
    const b = t.marks.bumps, e = t.marks.bumpsEnd;
    const H = 2.6;
    const ceil = [[b.x - 3, b.y + H + 2.5], [b.x - 1.2, b.y + H + 0.3], [b.x, b.y + H], [e.x, e.y + H], [e.x + 1.2, e.y + H + 0.3], [e.x + 3, e.y + H + 2.5]];
    const p = t.marks.plateau;
    // 낭떠러지: 고원 끝에서 아래로 뚝
    t.pieces[t.pieces.length - 1].push([t.marks.cliff.x + 0.01, t.marks.cliff.y - 40]);
    return {
      name: '총정리', hint: '천천히 → 빨리 → 깃발 사이에서 멈추기. 반대로 기울이면 멈춰요.',
      t, start: 3, stopZone: { x0: p.x + 5, x1: p.x + 11 },
      signs: [{ x: b.x - 10, kind: 'turtle' }, { x: t.marks.kick.x - 14, kind: 'rabbit' }],
      ceil: [ceil], rockTop: b.y + H + 6,
      gaps: [{ x0: t.marks.lip.x, x1: t.marks.lip.x + 6.5 }], cliffX: t.marks.cliff.x
    };
  }
  const STAGES = [stage1, stage2, stage3, stage4, stage5];

  function groundYAt(pieces, x) {
    for (const pc of pieces) {
      for (let i = 1; i < pc.length; i++) {
        const [x0, y0] = pc[i - 1], [x1, y1] = pc[i];
        if (x >= x0 && x <= x1 && x1 > x0) return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
      }
    }
    return null;
  }

  // ---------- 시뮬레이션 ----------
  function Sim(stageIndex) {
    const def = STAGES[stageIndex]();
    this.def = def; this.index = stageIndex;
    const world = this.world = new planck.World({ gravity: Vec2(0, -G) });
    // 땅
    let minY = Infinity;
    for (const pc of def.t.pieces) {
      if (pc.length < 2) continue;
      const body = world.createBody();
      body.createFixture(Chain(pc.map(p => Vec2(p[0], p[1])), false), { friction: 0.95, userData: 'ground' });
      for (const p of pc) minY = Math.min(minY, p[1]);
    }
    // 출발 뒤 벽
    const g0 = def.t.pieces[0][0];
    world.createBody().createFixture(Edge(Vec2(g0[0], g0[1]), Vec2(g0[0], g0[1] + 12)), { userData: 'wall' });
    // 천장
    for (const c of def.ceil) {
      world.createBody().createFixture(Chain(c.map(p => Vec2(p[0], p[1])), false), { friction: 0.5, userData: 'ceil' });
    }
    this.killY = minY - 6;
    this.makeBike(def.start);
    this.phi = 0; this.time = 0; this.acc = 0;
    this.result = null;       // {ok:true} | {ok:false, kind}
    this.crashKind = null;
    this.backTime = 0; this.stopTime = 0; this.upsideTime = 0;
    this.maxX = 0;
    world.on('begin-contact', (c) => {
      const a = c.getFixtureA(), b = c.getFixtureB();
      const ua = a.getUserData(), ub = b.getUserData();
      const isRider = u => u === 'head' || u === 'torso';
      const isWorld = u => u === 'ground' || u === 'ceil' || u === 'wall';
      if (isRider(ua) && isWorld(ub)) this.crashKind = this.crashKind || ub;
      else if (isRider(ub) && isWorld(ua)) this.crashKind = this.crashKind || ua;
    });
  }

  Sim.prototype.makeBike = function (x) {
    const world = this.world;
    const gy = groundYAt(this.def.t.pieces, x);
    const y = gy + R + 0.02;
    const grp = -1;
    const chassis = world.createDynamicBody({ position: Vec2(x, y + 0.1) });
    chassis.createFixture(Polygon([Vec2(-0.55, 0.06), Vec2(0.55, 0.06), Vec2(0.42, 0.46), Vec2(-0.36, 0.46)]),
      { density: 25, friction: 0.5, filterGroupIndex: grp, userData: 'frame' });
    chassis.createFixture(Box(0.14, 0.32, Vec2(-0.06, 0.86), -0.35),
      { density: 40, friction: 0.5, filterGroupIndex: grp, userData: 'torso' });
    chassis.createFixture(Circle(Vec2(0.1, 1.32), 0.16),
      { density: 40, friction: 0.5, filterGroupIndex: grp, userData: 'head' });
    const wheels = [];
    for (const dx of [-0.55, 0.55]) {
      const w = world.createDynamicBody({ position: Vec2(x + dx, y), angularDamping: 0.05 });
      w.createFixture(Circle(R), { density: 4, friction: 1.0, restitution: 0, filterGroupIndex: grp, userData: 'wheel' });
      const j = world.createJoint(WheelJoint({ enableMotor: false, frequencyHz: 4.5, dampingRatio: 0.7 }, chassis, w, w.getPosition(), Vec2(0, 1)));
      wheels.push({ body: w, joint: j });
    }
    this.chassis = chassis; this.wheels = wheels;
    this.mass = chassis.getMass() + wheels[0].body.getMass() + wheels[1].body.getMass();
    this.kDrag = Math.sin(MAX_TILT) * G * this.mass / (VT * VT);
  };

  Sim.prototype.grounded = function () {
    let n = 0;
    for (const w of this.wheels) {
      for (let ce = w.body.getContactList(); ce; ce = ce.next) {
        if (ce.contact.isTouching()) { n++; break; }
      }
    }
    return n;
  };

  Sim.prototype.speed = function () { return this.chassis.getLinearVelocity().length(); };
  Sim.prototype.vx = function () { return this.chassis.getLinearVelocity().x; };
  Sim.prototype.frontX = function () { return this.wheels[1].body.getPosition().x; };
  Sim.prototype.rearX = function () { return this.wheels[0].body.getPosition().x; };

  // phi: 게임 기울기 (라디안, 이미 데드존·최대값 처리된 값)
  Sim.prototype.step = function (phi, dt) {
    if (this.result) return;
    phi = Math.max(-MAX_TILT, Math.min(MAX_TILT, phi));
    this.phi = phi;
    this.world.setGravity(Vec2(G * Math.sin(phi), -G * Math.cos(phi)));
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= DT && !this.result) {
      this.acc -= DT;
      this.fixedStep();
    }
  };

  Sim.prototype.fixedStep = function () {
    const ch = this.chassis;
    const v = ch.getLinearVelocity();
    const sp = v.length();
    // 공기 저항
    if (sp > 0.01) ch.applyForceToCenter(Vec2(-this.kDrag * v.x * sp, -this.kDrag * v.y * sp), true);
    // 구름 저항 (바퀴가 땅에 닿아 있을 때)
    const gnd = this.grounded();
    if (gnd > 0 && sp > 0.001) {
      const f = CRR * this.mass * G * Math.tanh(sp / 0.3) * (gnd / 2);
      ch.applyForceToCenter(Vec2(-f * v.x / sp, -f * v.y / sp), true);
    }
    this.world.step(DT, 10, 4);
    this.time += DT;
    this.checkEnd();
  };

  Sim.prototype.checkEnd = function () {
    const def = this.def, ch = this.chassis;
    const p = ch.getPosition();
    this.maxX = Math.max(this.maxX, p.x);
    // 실패 이유: 낭떠러지·틈 근처에서 일어난 일은 그쪽 이유로 묶음
    const cliff = def.cliffX != null && p.x > def.cliffX - 0.5;
    const inGap = !!(def.gaps && def.gaps.some(g => p.x > g.x0 - 1.2 && p.x < g.x1 + 1.0 && p.y < groundYAt(def.t.pieces, g.x0 - 0.5) + 0.8));
    const fail = (kind, extra) => {
      const k = kind === 'ceil' ? 'ceil' : cliff ? 'cliff' : inGap ? 'gap' : kind;
      this.result = Object.assign({ ok: false, kind: k, speed: this.speed() }, extra || {});
    };
    if (this.crashKind) { fail(this.crashKind === 'ceil' ? 'ceil' : 'crash'); return; }
    if (p.y < this.killY || (inGap && p.y < groundYAt(def.t.pieces, def.gaps.find(g => p.x > g.x0 - 1.2 && p.x < g.x1 + 1.0).x0 - 0.5) - 3)) { fail(cliff ? 'cliff' : 'gap'); return; }
    // 뒤집힘
    let a = ch.getAngle() % (2 * Math.PI);
    if (a > Math.PI) a -= 2 * Math.PI; if (a < -Math.PI) a += 2 * Math.PI;
    this.upsideTime = Math.abs(a) > 2.0 ? this.upsideTime + DT : 0;
    if (this.upsideTime > 0.4) { fail('crash'); return; }
    // 바퀴가 땅에 닿은 채로 몸이 땅에 비해 45° 넘게 숙거나 젖혀지면 고꾸라짐
    const ya = groundYAt(def.t.pieces, p.x - 0.5), yb = groundYAt(def.t.pieces, p.x + 0.5);
    if (ya != null && yb != null && this.grounded() > 0) {
      const rel = a - Math.atan2(yb - ya, 1);
      if (Math.abs(rel) > 45 * Math.PI / 180) { fail('crash', { pitch: rel }); return; }
    }
    // 성공
    if (def.finish != null && this.frontX() >= def.finish) { this.result = { ok: true }; return; }
    if (def.stopZone) {
      const z = def.stopZone;
      const inZone = this.rearX() >= z.x0 && this.frontX() <= z.x1 && this.grounded() === 2;
      this.stopTime = inZone && this.speed() < 0.3 ? this.stopTime + DT : 0;
      if (this.stopTime > 0.6) { this.result = { ok: true }; return; }
    }
    // 뒤로 밀림 (힌트용, 실패 아님)
    this.backTime = this.vx() < -0.4 ? this.backTime + DT : 0;
  };

  // 끝난 뒤 넘어지는 모습만 이어서 보여 줄 때 (판정 없음)
  Sim.prototype.stepFree = function (dt) {
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= DT) { this.acc -= DT; this.world.step(DT, 10, 4); }
  };

  Sim.prototype.snapshot = function () {
    const ch = this.chassis;
    const p = ch.getPosition();
    return {
      x: p.x, y: p.y, angle: ch.getAngle(),
      wheels: this.wheels.map(w => { const q = w.body.getPosition(); return { x: q.x, y: q.y, angle: w.body.getAngle() }; }),
      speed: this.speed(), vx: this.vx(), grounded: this.grounded(), time: this.time
    };
  };

  const api = { Sim, STAGES, G, MAX_TILT, R, groundYAt, stageCount: STAGES.length };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TiltCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
