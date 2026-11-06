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
  const BRIDGE_HOLD = 0.32;  // 썩은 다리: 처음 밟은 뒤 이 시간부터 판자가 차례로 떨어짐
  const BRIDGE_STEP = 0.07;

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
  // 솟은 턱: 오르막 up m로 h만큼 오르고, 윗면 top m, 내리막 down m (평지 기준)
  Terrain.prototype.kicker = function (h, up, top, down, blend) {
    blend = blend == null ? 0.5 : blend;
    this.go(Math.hypot(up, h), Math.atan2(h, up) * 180 / Math.PI, blend);
    this.go(top, 0, blend);
    this.go(Math.hypot(down, h), -Math.atan2(h, down) * 180 / Math.PI, blend);
    return this.go(0.6, 0, blend);
  };
  // 턱 n개가 있는 터널 바닥
  Terrain.prototype.kickers = function (n) {
    for (let i = 0; i < n; i++) this.kicker(0.5, 1.3, 0.5, 1.3).go(2.5, 0, 0.3);
    return this;
  };
  // 틈: 지금 땅을 끝내고 len m 뒤, dy(+면 위)에서 새 땅 시작
  Terrain.prototype.gap = function (len, dy) {
    this.x += len; this.y += dy;
    this.pieces.push([[this.x, this.y]]);
    this.a = 0;
    return this;
  };
  // 수직 낭떠러지 (판 끝)
  Terrain.prototype.cliff = function () {
    this.pieces[this.pieces.length - 1].push([this.x + 0.01, this.y - 40]);
    return this;
  };
  Terrain.prototype.mark = function (name) { this.marks[name] = { x: this.x, y: this.y }; return this; };
  // [실험실] 돌길: 평지(또는 deg 경사) len m 동안 작은 돌 요철
  Terrain.prototype.rocky = function (len, deg, amp, seed) {
    let r = seed || 7; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    const a = (deg || 0) * Math.PI / 180, cur = this.pieces[this.pieces.length - 1];
    let d = 0; const x0 = this.x, y0 = this.y;
    while (d < len) {
      const w = 0.5 + rnd() * 0.6, h = (amp || 0.12) * (0.4 + rnd() * 0.8);
      for (let i = 1; i <= 4; i++) {
        const u = i / 4, dd = Math.min(len, d + w * u);
        const bx = x0 + dd * Math.cos(a), by = y0 + dd * Math.sin(a) + h * Math.sin(Math.PI * u);
        cur.push([bx, by]);
      }
      d += w;
    }
    this.x = x0 + len * Math.cos(a); this.y = y0 + len * Math.sin(a); this.a = a;
    cur.push([this.x, this.y]);
    return this;
  };
  // [실험실] 점프로 넘어야 하는 상자 (높이 h, 폭 w)
  Terrain.prototype.block = function (h, w) {
    const cur = this.pieces[this.pieces.length - 1];
    this.blocks = this.blocks || [];
    this.blocks.push({ x0: this.x, x1: this.x + w, y: this.y, h });
    cur.push([this.x + 0.02, this.y + h], [this.x + w - 0.02, this.y + h], [this.x + w, this.y]);
    this.x += w; this.a = 0;
    return this;
  };
  // [실험실] 360° 루프: 지금 위치가 루프 바닥. 길은 그대로 앞으로 이어짐
  // 곡률이 0→1/r로 서서히 커지는 진입·탈출 곡선(클로소이드)이라 앞바퀴가 벽에 박히지 않음
  Terrain.prototype.loop = function (r, le) {
    le = le || 4;
    const k = 1 / r, arc = 2 * Math.PI * r, total = arc + le, ds = 0.05, path = [[this.x, this.y]];
    let x = this.x, y = this.y, h = 0, top = 0;
    for (let d = ds; d <= total + 1e-9; d += ds) {
      const kk = d < le ? k * d / le : d > arc ? k * (total - d) / le : k;
      h += kk * ds; x += Math.cos(h) * ds; y += Math.sin(h) * ds; path.push([x, y]);
      if (!top && h >= Math.PI) top = path.length - 1;
    }
    const xs = path.map(p => p[0]), ys = path.map(p => p[1]);
    this.loops = this.loops || [];
    this.loops.push({ path, top, x0: Math.min(...xs), x1: Math.max(...xs), y0: this.y, y1: Math.max(...ys), xTop: path[top][0], xIn: this.x, xOut: x, r });
    return this;
  };

  // 바위 천장 (턱 구간 b~e 위, 높이 H)
  function tunnelCeil(b, e, H) {
    return [[b.x - 3, b.y + H + 2.5], [b.x - 1.2, b.y + H + 0.3], [b.x, b.y + H], [e.x, e.y + H], [e.x + 1.2, e.y + H + 0.3], [e.x + 3, e.y + H + 2.5]];
  }

  // ---------- 판 ----------
  // 각 판: { id, world, name:{ko,en}, hint:{ko,en}, t, start, finish | stopZone, signs, ceil, gaps, bridges, gates, winds, cliffX, par }
  const S = [];
  function def(o) { o.signs = o.signs || []; o.ceil = o.ceil || []; o.gaps = o.gaps || []; o.bridges = o.bridges || []; o.gates = o.gates || []; o.winds = o.winds || []; return o; }

  // === 세계 1: 언덕 마을 ===
  S.push(() => {
    const t = new Terrain(0, 0);
    t.go(10, 0).go(26, -6, 4).go(40, 0, 4).mark('end');
    return def({ id: '1-1', world: 0, name: { ko: '첫 내리막', en: 'First Downhill' },
      hint: { ko: '오른쪽으로 기울이면 길이 내리막이 돼요. 깃발까지 가 보세요.', en: 'Tilt right and the road tips downhill. Ride to the flag.' },
      t, start: 3, finish: t.marks.end.x - 10 });
  });
  S.push(() => {
    const t = new Terrain(0, 0);
    t.go(8, 0).go(30, -12, 4).go(4, 0, 3).mark('hill').go(11, 33, 3).mark('top').go(26, 0, 5).mark('end');
    return def({ id: '1-2', world: 0, name: { ko: '높은 오르막', en: 'Big Climb' },
      hint: { ko: '가파른 오르막은 기울기만으론 못 올라가요. 내리막에서 속도를 모아 오세요.', en: 'Tilt alone will not climb a steep hill. Build speed on the way down.' },
      t, start: 3, finish: t.marks.end.x - 8 });
  });
  S.push(() => {
    const t = new Terrain(0, 0);
    t.go(6, 0).go(26, -10, 4).go(9, 0, 3).mark('sign').go(4.5, 16, 2.5).mark('lip')
      .gap(7.5, -2.2).go(18, -12, 0).go(30, 0, 5).mark('end');
    return def({ id: '1-3', world: 0, name: { ko: '틈 점프', en: 'The Gap' },
      hint: { ko: '토끼 표지판: 빨리 와야 틈을 넘어요.', en: 'Rabbit sign: come in fast to clear the gap.' },
      t, start: 3, finish: t.marks.end.x - 8,
      signs: [{ x: t.marks.sign.x - 7, kind: 'rabbit' }], gaps: [{ x0: t.marks.lip.x, x1: t.marks.lip.x + 7.5 }] });
  });
  S.push(() => {
    const t = new Terrain(0, 0);
    t.go(6, 0).go(22, -14, 4).go(14, 0, 4).mark('bumps').kickers(3).mark('bumpsEnd').go(18, 0, 0).mark('end');
    const b = t.marks.bumps, e = t.marks.bumpsEnd, H = 2.6;
    return def({ id: '1-4', world: 0, name: { ko: '둔덕 터널', en: 'Bump Tunnel' },
      hint: { ko: '거북이 표지판: 천천히! 빠르면 턱에서 튀어 바위에 머리를 박아요.', en: 'Turtle sign: slow down! Too fast and the bumps throw you into the rock.' },
      t, start: 3, finish: t.marks.end.x - 8,
      signs: [{ x: b.x - 12, kind: 'turtle' }], ceil: [tunnelCeil(b, e, H)], rockTop: b.y + H + 6, tunnel: [b.x - 3, e.x + 3] });
  });
  S.push(() => {
    const t = new Terrain(0, 0);
    t.go(6, 0).go(18, -10, 4).go(14, 0, 4).mark('bumps').kickers(2).mark('bumpsEnd')
      .go(6, 0, 0).go(14, -9, 3).go(5, 0, 2).mark('kick').go(4.5, 16, 2.5).mark('lip')
      .gap(6.5, -2.0).go(16, -12, 0).go(8, 0, 4).go(9, 6, 3).mark('plateau').go(16, 0, 3).mark('cliff').cliff();
    const b = t.marks.bumps, e = t.marks.bumpsEnd, H = 2.6, p = t.marks.plateau;
    return def({ id: '1-5', world: 0, name: { ko: '정지선', en: 'Stop Line' },
      hint: { ko: '천천히 → 빨리 → 깃발 사이에서 멈추기. 반대로 기울이면 멈춰요.', en: 'Slow, then fast, then stop between the flags. Tilt back to brake.' },
      t, start: 3, stopZone: { x0: p.x + 5, x1: p.x + 11 },
      signs: [{ x: b.x - 10, kind: 'turtle' }, { x: t.marks.kick.x - 14, kind: 'rabbit' }],
      ceil: [tunnelCeil(b, e, H)], rockTop: b.y + H + 6, tunnel: [b.x - 3, e.x + 3],
      gaps: [{ x0: t.marks.lip.x, x1: t.marks.lip.x + 6.5 }], cliffX: t.marks.cliff.x });
  });

  // === 세계 2: 협곡 ===
  S.push(() => {
    const t = new Terrain(0, 0);
    t.go(6, 0).go(22, -10, 4).go(6, 0, 3).mark('sign').go(4.5, 16, 2.5).mark('lip1').gap(6.5, -2.0)
      .go(14, -11, 0).go(6, 0, 3).go(4.5, 16, 2.5).mark('lip2').gap(8, -2.5).go(16, -12, 0).go(24, 0, 4).mark('end');
    return def({ id: '2-1', world: 1, name: { ko: '두 번 점프', en: 'Double Jump' },
      hint: { ko: '틈이 둘이에요. 착지한 뒤에도 계속 기울여 두 번째 틈까지 속도를 지키세요.', en: 'Two gaps. Keep tilting after you land so you still have speed for the second.' },
      t, start: 3, finish: t.marks.end.x - 8,
      signs: [{ x: t.marks.sign.x - 7, kind: 'rabbit' }],
      gaps: [{ x0: t.marks.lip1.x, x1: t.marks.lip1.x + 6.5 }, { x0: t.marks.lip2.x, x1: t.marks.lip2.x + 8 }] });
  });
  S.push(() => {
    const t = new Terrain(0, 0);
    t.go(6, 0).go(24, -9, 4).go(10, 0, 3).mark('sign').go(3, 0, 0).mark('b0').gap(9, 0).mark('b1').go(26, 0, 0).mark('end');
    return def({ id: '2-2', world: 1, name: { ko: '썩은 다리', en: 'Rotten Bridge' },
      hint: { ko: '다리는 밟으면 무너져요. 빨리 건너면 괜찮아요.', en: 'The bridge collapses once you are on it. Cross fast and you are fine.' },
      t, start: 3, finish: t.marks.end.x - 8,
      signs: [{ x: t.marks.sign.x - 6, kind: 'rabbit' }],
      bridges: [{ x0: t.marks.b0.x, x1: t.marks.b1.x, y: t.marks.b0.y }],
      gaps: [{ x0: t.marks.b0.x, x1: t.marks.b1.x }] });
  });
  S.push(() => {
    const t = new Terrain(0, 0);
    t.go(6, 0).go(20, -12, 4).go(12, 0, 4).mark('bumps').kickers(4).mark('bumpsEnd')
      .go(5, 0, 0).go(16, -12, 3).go(5, 0, 2).mark('kick').go(4.5, 16, 2.5).mark('lip').gap(7, -2.2).go(16, -12, 0).go(22, 0, 4).mark('end');
    const b = t.marks.bumps, e = t.marks.bumpsEnd, H = 2.6;
    return def({ id: '2-3', world: 1, name: { ko: '낮은 동굴', en: 'Low Cave' },
      hint: { ko: '동굴은 천천히, 나오자마자 내리막에서 속도를 모아 틈을 넘어요.', en: 'Crawl through the cave, then build speed on the slope for the gap.' },
      t, start: 3, finish: t.marks.end.x - 8,
      signs: [{ x: b.x - 11, kind: 'turtle' }, { x: t.marks.kick.x - 13, kind: 'rabbit' }],
      ceil: [tunnelCeil(b, e, H)], rockTop: b.y + H + 6, tunnel: [b.x - 3, e.x + 3],
      gaps: [{ x0: t.marks.lip.x, x1: t.marks.lip.x + 7 }] });
  });
  S.push(() => {
    const t = new Terrain(0, 0);
    t.go(6, 0).go(12, -8, 4).go(6, 0, 3).mark('sign').go(14, -34, 2).mark('bottom').go(1.5, 0, 0.6).go(10, 0, 0).mark('bumps').kickers(2).mark('bumpsEnd').go(20, 0, 0).mark('end');
    const b = t.marks.bumps, e = t.marks.bumpsEnd, H = 2.6;
    return def({ id: '2-4', world: 1, name: { ko: '급경사', en: 'Steep Drop' },
      hint: { ko: '급한 내리막 끝에 바로 낮은 바위예요. 내려가면서부터 반대로 기울여 속도를 줄이세요.', en: 'A steep drop runs straight into low rock. Start braking on the way down.' },
      t, start: 3, finish: t.marks.end.x - 8,
      signs: [{ x: t.marks.sign.x - 5, kind: 'turtle' }],
      ceil: [tunnelCeil(b, e, H)], rockTop: b.y + H + 6, tunnel: [b.x - 3, e.x + 3] });
  });
  S.push(() => {
    const t = new Terrain(0, 0);
    t.go(6, 0).go(18, -10, 4).go(6, 0, 3).mark('sign1').go(4.5, 16, 2.5).mark('lip').gap(7, -2.2).go(14, -12, 0).go(8, 0, 4)
      .mark('b0').gap(9, 0).mark('b1').go(8, 0, 0).mark('sign2').go(8, 0, 0).mark('bumps').kickers(3).mark('bumpsEnd')
      .go(6, 0, 0).go(10, 8, 3).mark('plateau').go(14, 0, 3).mark('cliff').cliff();
    const b = t.marks.bumps, e = t.marks.bumpsEnd, H = 2.6, p = t.marks.plateau;
    return def({ id: '2-5', world: 1, name: { ko: '협곡 횡단', en: 'Canyon Run' },
      hint: { ko: '틈 → 다리 → 동굴 → 멈추기. 협곡의 모든 것.', en: 'Gap, bridge, cave, stop. Everything the canyon has.' },
      t, start: 3, stopZone: { x0: p.x + 4, x1: p.x + 9.5 },
      signs: [{ x: t.marks.sign1.x - 7, kind: 'rabbit' }, { x: t.marks.sign2.x - 1, kind: 'turtle' }],
      ceil: [tunnelCeil(b, e, H)], rockTop: b.y + H + 6, tunnel: [b.x - 3, e.x + 3],
      bridges: [{ x0: t.marks.b0.x, x1: t.marks.b1.x, y: t.marks.b0.y }],
      gaps: [{ x0: t.marks.lip.x, x1: t.marks.lip.x + 7 }, { x0: t.marks.b0.x, x1: t.marks.b1.x }], cliffX: t.marks.cliff.x });
  });

  // === 세계 3: 폭풍 봉우리 ===
  S.push(() => {
    const t = new Terrain(0, 0);
    t.go(6, 0).go(16, -8, 4).go(4, 0, 3).mark('w0').go(26, 0, 0).mark('w1').go(4, 0, 0).go(12, 20, 3).mark('top').go(20, 0, 4).mark('end');
    return def({ id: '3-1', world: 2, name: { ko: '맞바람', en: 'Headwind' },
      hint: { ko: '바람이 앞에서 불어요. 끝까지 기울여야 밀리지 않아요.', en: 'The wind blows against you. Tilt all the way or you will be pushed back.' },
      t, start: 3, finish: t.marks.end.x - 8,
      signs: [{ x: t.marks.w0.x - 6, kind: 'wind', dir: -1 }],
      winds: [{ x0: t.marks.w0.x, x1: t.marks.w1.x, f: -4.2 }] });
  });
  S.push(() => {
    const t = new Terrain(0, 0);
    t.go(6, 0).go(20, -10, 4).go(6, 0, 3).mark('z0').go(6, 0, 0).mark('gate').go(3, 0, 0).go(18, -12, 3).go(5, 0, 2).mark('kick').go(4.5, 16, 2.5).mark('lip').gap(6.5, -2.0).go(14, -12, 0).go(22, 0, 4).mark('end');
    return def({ id: '3-2', world: 2, name: { ko: '검문소', en: 'Checkpoint' },
      hint: { ko: '차단기 앞 노란 구역에서 완전히 멈추면 차단기가 열려요.', en: 'Come to a full stop in the yellow zone and the barrier lifts.' },
      t, start: 3, finish: t.marks.end.x - 8,
      signs: [{ x: t.marks.z0.x - 7, kind: 'stop' }, { x: t.marks.kick.x - 12, kind: 'rabbit' }],
      gates: [{ x: t.marks.gate.x, zone: { x0: t.marks.z0.x, x1: t.marks.gate.x - 0.6 } }],
      gaps: [{ x0: t.marks.lip.x, x1: t.marks.lip.x + 6.5 }] });
  });
  S.push(() => {
    const t = new Terrain(0, 0);
    t.go(6, 0).go(14, -8, 4).go(4, 0, 3).mark('w0').go(22, 0, 0).mark('w1').go(6, 0, 0).mark('bumps').kickers(3).mark('bumpsEnd').go(18, 0, 0).mark('end');
    const b = t.marks.bumps, e = t.marks.bumpsEnd, H = 2.6;
    return def({ id: '3-3', world: 2, name: { ko: '뒷바람 터널', en: 'Tailwind Tunnel' },
      hint: { ko: '뒷바람이 터널로 밀어 넣어요. 미리, 세게 반대로 기울이세요.', en: 'A tailwind shoves you toward the tunnel. Brake early and hard.' },
      t, start: 3, finish: t.marks.end.x - 8,
      signs: [{ x: t.marks.w0.x - 5, kind: 'wind', dir: 1 }, { x: t.marks.w1.x - 2, kind: 'turtle' }],
      winds: [{ x0: t.marks.w0.x, x1: t.marks.w1.x, f: 4.5 }],
      ceil: [tunnelCeil(b, e, H)], rockTop: b.y + H + 6, tunnel: [b.x - 3, e.x + 3] });
  });
  S.push(() => {
    const t = new Terrain(0, 0);
    t.go(6, 0).go(16, -10, 4).go(5, 0, 3).mark('z0').go(6, 0, 0).mark('gate1').go(3, 0, 0).go(14, -11, 3).go(5, 0, 3).mark('sign')
      .go(3, 0, 0).mark('b0').gap(9, 0).mark('b1').go(10, 0, 0).go(8, 14, 3).go(5, 0, 3).mark('z1').go(6, 0, 0).mark('gate2').go(3, 0, 0).go(14, -10, 3).go(18, 0, 4).mark('end');
    return def({ id: '3-4', world: 2, name: { ko: '두 검문소', en: 'Two Checkpoints' },
      hint: { ko: '멈추고, 달려서 다리를 건너고, 또 멈추세요.', en: 'Stop, sprint across the bridge, and stop again.' },
      t, start: 3, finish: t.marks.end.x - 8,
      signs: [{ x: t.marks.z0.x - 7, kind: 'stop' }, { x: t.marks.sign.x - 7, kind: 'rabbit' }, { x: t.marks.z1.x - 6, kind: 'stop' }],
      gates: [{ x: t.marks.gate1.x, zone: { x0: t.marks.z0.x, x1: t.marks.gate1.x - 0.6 } }, { x: t.marks.gate2.x, zone: { x0: t.marks.z1.x, x1: t.marks.gate2.x - 0.6 } }],
      bridges: [{ x0: t.marks.b0.x, x1: t.marks.b1.x, y: t.marks.b0.y }],
      gaps: [{ x0: t.marks.b0.x, x1: t.marks.b1.x }] });
  });
  S.push(() => {
    const t = new Terrain(0, 0);
    t.go(6, 0).go(16, -10, 4).go(4, 0, 3).mark('w0').go(16, 0, 0).mark('w1').go(4, 0, 0).mark('bumps').kickers(2).mark('bumpsEnd')
      .go(4, 0, 0).go(16, -12, 3).go(5, 0, 2).mark('kick').go(4.5, 16, 2.5).mark('lip').gap(7.5, -2.3).go(14, -12, 0).go(6, 0, 4)
      .mark('b0').gap(9, 0).mark('b1').go(8, 0, 0).go(10, 18, 3).go(4, 0, 3).mark('z0').go(6, 0, 0).mark('gate').go(3, 0, 0).go(10, 10, 3).mark('plateau').go(14, 0, 3).mark('cliff').cliff();
    const b = t.marks.bumps, e = t.marks.bumpsEnd, H = 2.6, p = t.marks.plateau;
    return def({ id: '3-5', world: 2, name: { ko: '정상', en: 'Summit' },
      hint: { ko: '뒷바람 터널, 틈, 다리, 검문소, 그리고 정상에서 멈추기.', en: 'Tailwind tunnel, gap, bridge, checkpoint, then stop at the summit.' },
      t, start: 3, stopZone: { x0: p.x + 4, x1: p.x + 9.5 },
      signs: [{ x: t.marks.w0.x - 5, kind: 'wind', dir: 1 }, { x: t.marks.w1.x - 1, kind: 'turtle' }, { x: t.marks.kick.x - 12, kind: 'rabbit' }, { x: t.marks.z0.x - 6, kind: 'stop' }],
      winds: [{ x0: t.marks.w0.x, x1: t.marks.w1.x, f: 4.5 }],
      ceil: [tunnelCeil(b, e, H)], rockTop: b.y + H + 6, tunnel: [b.x - 3, e.x + 3],
      bridges: [{ x0: t.marks.b0.x, x1: t.marks.b1.x, y: t.marks.b0.y }],
      gates: [{ x: t.marks.gate.x, zone: { x0: t.marks.z0.x, x1: t.marks.gate.x - 0.6 } }],
      gaps: [{ x0: t.marks.lip.x, x1: t.marks.lip.x + 7.5 }, { x0: t.marks.b0.x, x1: t.marks.b1.x }], cliffX: t.marks.cliff.x });
  });


  // ===== [실험실] 효과 실험 코스 (게임 판과 별개, window.TILT_LAB일 때만 씀) =====
  const LAB = [];
  const lab = (o) => { o.world = 0; o.lab = true; const t = o.t; o.loops = t.loops || []; o.blocks = t.blocks || []; return def(o); };
  LAB.push(() => {
    const t = new Terrain(0, 0);
    t.go(6, 0).go(10, -6, 3).mark('i0').go(30, -9, 3).go(12, 0, 4).mark('i1').go(30, 0, 3).mark('end');
    return lab({ id: 'L1', theme: 2, icon: '🧊', name: { ko: '빙판 내리막', en: 'Icy Slope' }, hint: { ko: '얼음! 내리막에서 확 빨라지고, 반대로 기울여도 잘 안 서요.', en: 'Ice! You speed up fast and braking barely works.' },
      t, start: 3, finish: t.marks.end.x - 8, surfaces: [{ x0: t.marks.i0.x, x1: t.marks.i1.x, type: 'ice' }], signs: [{ x: t.marks.i0.x - 4, kind: 'ice' }] });
  });
  LAB.push(() => {
    const t = new Terrain(0, 0);
    t.go(6, 0).go(16, -7, 3).go(3, 0, 2).mark('r0').rocky(40, 0, 0.14, 11).mark('r1').go(6, 0, 0).go(24, 0, 2).mark('end');
    return lab({ id: 'L2', theme: 1, icon: '🪨', name: { ko: '돌길', en: 'Rocky Road' }, hint: { ko: '울퉁불퉁 돌길이라 덜컹거리고 느려져요. 계속 기울이세요.', en: 'Bumpy rocks shake you and slow you down. Keep tilting.' },
      t, start: 3, finish: t.marks.end.x - 8, surfaces: [{ x0: t.marks.r0.x, x1: t.marks.r1.x, type: 'rock' }], signs: [{ x: t.marks.r0.x - 4, kind: 'rock' }] });
  });
  LAB.push(() => {
    const t = new Terrain(0, 0);
    t.go(6, 0).go(18, -8, 3).go(4, 0, 2).mark('m0').go(22, 0, 0).mark('m1').go(6, 0, 0).go(14, -6, 3).mark('m2').go(14, 0, 3).mark('m3').go(24, 0, 3).mark('end');
    return lab({ id: 'L3', theme: 0, icon: '💦', name: { ko: '진흙탕', en: 'Mud Pit' }, hint: { ko: '진흙은 빠를수록 흙탕물이 튀어요. 속도가 쭉 빠져요.', en: 'The faster you go, the more mud flies. It drags you down.' },
      t, start: 3, finish: t.marks.end.x - 8, surfaces: [{ x0: t.marks.m0.x, x1: t.marks.m1.x, type: 'mud' }, { x0: t.marks.m2.x, x1: t.marks.m3.x, type: 'mud' }], signs: [{ x: t.marks.m0.x - 4, kind: 'mud' }] });
  });
  LAB.push(() => {
    const t = new Terrain(0, 0);
    t.go(6, 0).go(14, -6, 3).go(6, 0, 2).mark('b1').block(0.55, 0.8).go(18, 0, 0).mark('b2').block(0.6, 0.8).go(18, 0, 0).mark('j').gap(3.2, 0).go(18, 0, 0).mark('b3').block(0.55, 1.2).go(26, 0, 0).mark('end');
    return lab({ id: 'L4', theme: 0, icon: '⤴️', name: { ko: '터치 점프', en: 'Tap to Jump' }, hint: { ko: '화면을 누르면 점프! (키보드: 스페이스) 상자와 틈을 넘으세요.', en: 'Tap to jump! (Keyboard: Space) Clear the crates and the gap.' },
      t, start: 3, finish: t.marks.end.x - 8, jump: true,
      signs: [{ x: t.marks.b1.x - 5, kind: 'jump' }, { x: t.marks.b2.x - 5, kind: 'jump' }, { x: t.marks.j.x - 5, kind: 'jump' }, { x: t.marks.b3.x - 5, kind: 'jump' }],
      gaps: [{ x0: t.marks.j.x, x1: t.marks.j.x + 3.2 }] });
  });
  LAB.push(() => {
    const t = new Terrain(0, 0);
    t.go(6, 0).go(18, -9, 3).go(8, 0, 2).mark('lip').gap(3, -4).go(30, -30, 3).mark('hillEnd').go(16, 0, 12).go(8, -6, 3).go(6, 0, 3).mark('kick').go(4.5, 16, 2.5).mark('lip2').gap(5, 1.2).go(24, 0, 0).mark('end');
    return lab({ id: 'L5', theme: 1, icon: '🏔️', name: { ko: '높낮이 큰 틈', en: 'Big Drops' }, hint: { ko: '낭떠러지에서 뛰어내려 긴 경사에 착지! 다음엔 위로 넘어요. 점프도 돼요.', en: 'Leap off the edge onto the long slope, then jump up the other side. Tap to jump.' },
      t, start: 3, finish: t.marks.end.x - 8, jump: true,
      signs: [{ x: t.marks.lip.x - 9, kind: 'rabbit' }, { x: t.marks.kick.x - 10, kind: 'rabbit' }],
      gaps: [{ x0: t.marks.lip.x, x1: t.marks.lip.x + 3, deep: true }, { x0: t.marks.lip2.x, x1: t.marks.lip2.x + 5 }] });
  });
  LAB.push(() => {
    const t = new Terrain(0, 0);
    t.go(6, 0).go(20, -10, 4).go(8, 0, 3).mark('kick').go(4.5, 16, 2.5).mark('lip').gap(7, -2.2).go(14, -12, 0).go(10, 0, 4).mark('bumps').kickers(2).mark('bumpsEnd')
      .go(8, 0, 0).go(10, 6, 3).mark('plateau').go(14, 0, 3).mark('cliff').cliff();
    const p = t.marks.plateau;
    return lab({ id: 'L6', theme: 0, icon: '🌫️', name: { ko: '안개', en: 'Fog' }, hint: { ko: '안개 때문에 앞이 잘 안 보여요. 표지판이 늦게 나타나요.', en: 'Thick fog. Signs appear late, so be ready.' },
      t, start: 3, stopZone: { x0: p.x + 4, x1: p.x + 9.5 }, env: { fog: 15 },
      signs: [{ x: t.marks.kick.x - 10, kind: 'rabbit' }, { x: t.marks.bumps.x - 6, kind: 'turtle' }],
      gaps: [{ x0: t.marks.lip.x, x1: t.marks.lip.x + 7 }], cliffX: t.marks.cliff.x });
  });
  LAB.push(() => {
    const t = new Terrain(0, 0);
    t.go(6, 0).go(20, -8, 3).go(10, 0, 3).go(16, -10, 3).go(6, 0, 3).mark('kick').go(4.5, 14, 2.5).mark('lip').gap(6, -2).go(14, -10, 0).go(26, 0, 4).mark('end');
    return lab({ id: 'L7', theme: 2, icon: '🌧️', name: { ko: '비', en: 'Rain' }, hint: { ko: '비에 젖은 길은 조금 미끄러워요. 브레이크가 덜 들어요.', en: 'The wet road is a little slippery. Brakes work less.' },
      t, start: 3, finish: t.marks.end.x - 8, env: { rain: 1 }, surfaces: [{ x0: -50, x1: 1e4, type: 'wet' }],
      signs: [{ x: t.marks.kick.x - 10, kind: 'rabbit' }], gaps: [{ x0: t.marks.lip.x, x1: t.marks.lip.x + 6 }] });
  });
  LAB.push(() => {
    const t = new Terrain(0, 0);
    t.go(6, 0).go(14, -8, 3).mark('w0').go(30, 0, 0).mark('w1').go(6, 0, 0).go(12, -6, 3).mark('w2').go(30, 0, 0).mark('w3').go(20, 0, 3).mark('end');
    return lab({ id: 'L8', theme: 1, icon: '🌪️', name: { ko: '돌풍', en: 'Gusts' }, hint: { ko: '바람이 세졌다 약해졌다 해요. 밀리면 더 기울이세요.', en: 'Gusts come and go. Lean harder when they push back.' },
      t, start: 3, finish: t.marks.end.x - 8,
      winds: [{ x0: t.marks.w0.x, x1: t.marks.w1.x, f: -2.2, gust: 4.2, per: 3.2 }, { x0: t.marks.w2.x, x1: t.marks.w3.x, f: 1.2, gust: 4.6, per: 2.6 }],
      signs: [{ x: t.marks.w0.x - 4, kind: 'wind', dir: -1 }, { x: t.marks.w2.x - 4, kind: 'wind', dir: 1 }] });
  });
  LAB.push(() => {
    const t = new Terrain(0, 0);
    t.go(6, 0).go(4, -10, 2).go(40, -30, 4).go(12, 0, 12).mark('loop').loop(5, 4).go(30, 0, 0).mark('end');
    return lab({ id: 'L9', theme: 0, icon: '🎢', name: { ko: '360° 루프', en: '360° Loop' }, hint: { ko: '끝까지 기울여 빠르게! 느리면 꼭대기에서 떨어져요.', en: 'Full tilt! Too slow and you fall off the top.' },
      t, start: 3, finish: t.marks.end.x - 8, signs: [{ x: t.marks.loop.x - 10, kind: 'rabbit' }] });
  });

  const IS_LAB = !!root.TILT_LAB;
  const STAGES = IS_LAB ? LAB : S;
  const WORLDS = IS_LAB ? [{ id: 'lab', name: { ko: '효과 실험실', en: 'Effect Lab' } }] : [
    { id: 'hills', name: { ko: '언덕 마을', en: 'Hillside' } },
    { id: 'canyon', name: { ko: '협곡', en: 'Canyon' } },
    { id: 'storm', name: { ko: '폭풍 봉우리', en: 'Storm Peak' } }
  ];
  // 기준 시간(초): test/par.js가 모범 운전으로 잰 시간 × 1.1 (3★ ≤ par, 2★ ≤ par × 1.4)
  const PAR = IS_LAB ? [] : [7, 8.5, 9, 14.5, 24, 10.5, 7.5, 21, 15.5, 21.5, 10, 16.5, 18, 23.5, 31.5];

  function groundYAt(pieces, x) {
    for (const pc of pieces) {
      for (let i = 1; i < pc.length; i++) {
        const [x0, y0] = pc[i - 1], [x1, y1] = pc[i];
        if (x >= x0 && x <= x1 && x1 > x0) return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
      }
    }
    return null;
  }
  function stars(index, time) {
    const par = PAR[index] || 999;
    return time <= par ? 3 : time <= par * 1.4 ? 2 : 1;
  }

  // ---------- 시뮬레이션 ----------
  function Sim(stageIndex) {
    const def = STAGES[stageIndex]();
    this.def = def; this.index = stageIndex;
    const world = this.world = new planck.World({ gravity: Vec2(0, -G) });
    let minY = Infinity;
    for (const pc of def.t.pieces) {
      if (pc.length < 2) continue;
      world.createBody().createFixture(Chain(pc.map(p => Vec2(p[0], p[1])), false), { friction: 0.95, userData: 'ground' });
      for (const p of pc) minY = Math.min(minY, p[1]);
    }
    const g0 = def.t.pieces[0][0];
    world.createBody().createFixture(Edge(Vec2(g0[0], g0[1]), Vec2(g0[0], g0[1] + 12)), { userData: 'wall' });
    for (const c of def.ceil) world.createBody().createFixture(Chain(c.map(p => Vec2(p[0], p[1])), false), { friction: 0.5, userData: 'ceil' });
    // 썩은 다리: 1m 판자들
    this.bridges = def.bridges.map(br => {
      const n = Math.round(br.x1 - br.x0);
      const w = (br.x1 - br.x0) / n;
      const planks = [];
      for (let i = 0; i < n; i++) {
        const body = world.createBody({ position: Vec2(br.x0 + (i + 0.5) * w, br.y - 0.12) });
        body.createFixture(Box(w / 2, 0.12), { density: 0.6, friction: 0.9, userData: 'plank' });
        planks.push({ body, fallen: false, fallAt: null });
      }
      return { def: br, planks, touchedAt: null };
    });
    // 검문소 차단기
    this.gates = def.gates.map(gt => {
      const gy = groundYAt(def.t.pieces, gt.x);
      const body = world.createBody();
      body.createFixture(Edge(Vec2(gt.x, gy), Vec2(gt.x, gy + 3)), { userData: 'gate' });
      return { def: gt, body, gy, open: false, holdTime: 0, lift: 0 };
    });
    this.killY = minY - 6;
    // [실험실] 루프: 앞 반쪽(분류 2)·뒤 반쪽(분류 4). 자전거는 꼭대기를 지나면 2 대신 4와 부딪힘
    this.loops = (def.loops || []).map(L => {
      const n = L.path.length, ov = 20, pick = (i0, i1) => { const pts = []; for (let i = i0; i < i1; i += 4) pts.push(Vec2(L.path[i][0], L.path[i][1])); pts.push(Vec2(L.path[i1][0], L.path[i1][1])); return pts; };
      const b = world.createBody();
      b.createFixture(Chain(pick(0, Math.min(n - 1, L.top + ov)), false), { friction: 0.95, userData: 'ground', filterCategoryBits: 2 });
      b.createFixture(Chain(pick(Math.max(0, L.top - ov), n - 1), false), { friction: 0.95, userData: 'ground', filterCategoryBits: 4 });
      return Object.assign({ passed: false, done: false }, L);
    });
    this.makeBike(def.start);
    if (this.loops.length) this.setBikeMask(0xFFFB);
    this.phi = 0; this.time = 0; this.acc = 0;
    this.result = null;
    this.crashKind = null;
    this.backTime = 0; this.stopTime = 0; this.upsideTime = 0;
    this.maxX = 0;
    this.events = [];
    this.wasGrounded = 2; this.airTime = 0;
    this.windNow = 0;
    world.on('begin-contact', (c) => {
      const a = c.getFixtureA(), b = c.getFixtureB();
      const ua = a.getUserData(), ub = b.getUserData();
      const isRider = u => u === 'head' || u === 'torso';
      const isWorld = u => u === 'ground' || u === 'ceil' || u === 'wall' || u === 'gate' || u === 'plank';
      if (isRider(ua) && isWorld(ub)) this.crashKind = this.crashKind || ub;
      else if (isRider(ub) && isWorld(ua)) this.crashKind = this.crashKind || ua;
      if (ua === 'plank' || ub === 'plank') {
        const pb = (ua === 'plank' ? a : b).getBody();
        for (const br of this.bridges) if (br.touchedAt == null && br.planks.some(p => p.body === pb)) { br.touchedAt = this.time; this.events.push({ t: 'bridge' }); }
      }
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

  function nearestIdx(path, p) { let bi = 0, bd = 1e9; for (let i = 0; i < path.length; i += 2) { const d = (path[i][0] - p.x) ** 2 + (path[i][1] - p.y) ** 2; if (d < bd) { bd = d; bi = i; } } return bi; }
  Sim.prototype.setBikeMask = function (mask) {
    for (const b of [this.chassis, ...this.wheels.map(w => w.body)])
      for (let f = b.getFixtureList(); f; f = f.getNext()) f.setFilterData({ groupIndex: -1, categoryBits: 1, maskBits: mask });
  };
  // [실험실] 바닥 재질: rr = 구름 저항, push = 내리막 가속 보탬(얼음), visc = 속도 비례 감속(진흙)
  const SURF = { ice: { rr: 0.002, push: 0.6, brake: 0.5 }, rock: { rr: 0.1 }, mud: { rr: 0.05, visc: 0.22 }, wet: { rr: 0.012, push: 0.1, brake: 0.25 } };
  Sim.prototype.surfaceAt = function (x) {
    const ss = this.def.surfaces; if (!ss) return null;
    for (const s of ss) if (x >= s.x0 && x <= s.x1) return s.type;
    return null;
  };
  // [실험실] 점프: 바퀴가 땅에 닿아 있을 때만
  Sim.prototype.jump = function () {
    if (this.result || this.grounded() === 0 || this.time - (this.lastJump == null ? -9 : this.lastJump) < 0.35) return false;
    const a = this.chassis.getAngle(), n = Vec2(-Math.sin(a), Math.cos(a)), J = 5.2;
    for (const b of [this.chassis, ...this.wheels.map(w => w.body)]) { const v = b.getLinearVelocity(); b.setLinearVelocity(Vec2(v.x + n.x * J, v.y + n.y * J)); }
    this.lastJump = this.time; this.jumps = (this.jumps || 0) + 1;
    return true;
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
    const p = ch.getPosition();
    // [실험실] 루프 안은 레일 위처럼: 공기저항 15%, 서스펜션 단단하게
    const pp = ch.getPosition(), railNow = this.loops.length > 0 && this.loops.some(L => pp.x > L.x0 - 1 && pp.x < L.x1 + 1 && pp.y > L.y0 + R + 0.15);
    if (railNow !== !!this.rail) { this.rail = railNow; for (const w of this.wheels) w.joint.setSpringFrequencyHz(railNow ? 12 : 4.5); }
    const kd = this.kDrag * (railNow ? 0.15 : 1);
    if (sp > 0.01) {
      if (this.def.lab) { // [실험실] 공기저항을 무게 비율로 나눠 걸어 공중에서 앞이 들리지 않게
        for (const b of [ch, this.wheels[0].body, this.wheels[1].body]) { const sh = b.getMass() / this.mass, bv = b.getLinearVelocity(); b.applyForceToCenter(Vec2(-kd * bv.x * sp * sh, -kd * bv.y * sp * sh), true); }
      } else ch.applyForceToCenter(Vec2(-kd * v.x * sp, -kd * v.y * sp), true);
    }
    const gnd = this.grounded();
    if (this.def.lab) ch.setAngularDamping(gnd === 0 && !this.rail ? 4 : 0); // [실험실] 공중 균형: 공중에서 차체 회전을 천천히 멈춤
    const st = gnd > 0 ? this.surfaceAt(p.x) : null, S0 = st && SURF[st];
    this.surfNow = st;
    if (gnd > 0 && sp > 0.001) {
      const f = (S0 ? S0.rr : CRR) * this.mass * G * Math.tanh(sp / 0.3) * (gnd / 2);
      ch.applyForceToCenter(Vec2(-f * v.x / sp, -f * v.y / sp), true);
    }
    if (S0 && gnd > 0) {
      const ya = groundYAt(this.def.t.pieces, p.x - 0.5), yb = groundYAt(this.def.t.pieces, p.x + 0.5);
      const sl = ya != null && yb != null ? Math.atan2(yb - ya, 1) : 0, tx = Math.cos(sl), ty = Math.sin(sl);
      const along = G * Math.sin(this.phi - sl);                    // 기울기+경사로 생기는 앞뒤 가속
      if (S0.push && along > 0) ch.applyForceToCenter(Vec2(S0.push * this.mass * along * tx, S0.push * this.mass * along * ty), true);
      if (S0.brake && along < 0) ch.applyForceToCenter(Vec2(-S0.brake * this.mass * along * tx, -S0.brake * this.mass * along * ty), true);
      if (S0.visc) ch.applyForceToCenter(Vec2(-S0.visc * this.mass * v.x, -S0.visc * this.mass * v.y), true);
    }
    // 바람
    this.windNow = 0;
    for (const w of this.def.winds) if (p.x >= w.x0 && p.x <= w.x1) {
      let f = w.f;
      if (w.gust) { const t = this.time; f = w.f + w.gust * Math.sin(2 * Math.PI * t / (w.per || 3)) * (0.65 + 0.35 * Math.sin(2 * Math.PI * t / 1.3 + 1)); }
      this.windNow = f; ch.applyForceToCenter(Vec2(f * this.mass, 0), true);
    }
    // 루프: 꼭대기를 지나면 뒤 반쪽과 부딪히게, 빠져나가면 원래대로
    for (const L of this.loops) {
      if (!L.passed && p.x > L.x0 - 0.5 && p.x < L.x1 + 0.5 && p.y > (L.y0 + L.y1) / 2 && nearestIdx(L.path, p) > L.top) { L.passed = true; this.setBikeMask(0xFFFD); }
      if (L.passed && !L.done && p.x > L.x1 + 1.2 && p.y < L.y0 + 1.5) { L.done = true; this.setBikeMask(0xFFFB); }
    }
    // 썩은 다리: 처음 밟은 뒤 판자가 차례로 떨어짐
    for (const br of this.bridges) {
      if (br.touchedAt == null) continue;
      br.planks.forEach((pl, i) => {
        if (!pl.fallen && this.time >= br.touchedAt + BRIDGE_HOLD + i * BRIDGE_STEP) {
          pl.fallen = true; pl.fallAt = this.time;
          pl.body.setDynamic(); pl.body.setAngularVelocity((i % 2 ? 1 : -1) * 2);
        }
      });
    }
    // 검문소: 구역 안에서 멈추면 열림
    for (const gt of this.gates) {
      if (gt.open) { gt.lift = Math.min(1, gt.lift + DT * 1.8); continue; }
      const z = gt.def.zone;
      const inZone = this.rearX() >= z.x0 && this.frontX() <= z.x1 && gnd === 2 && sp < 0.3;
      gt.holdTime = inZone ? gt.holdTime + DT : 0;
      if (gt.holdTime > 0.5) { gt.open = true; gt.body.setActive(false); this.events.push({ t: 'gate' }); }
    }
    this.world.step(DT, 10, 4);
    this.time += DT;
    // 공중/착지 이벤트
    const g2 = this.grounded();
    if (this.wasGrounded > 0 && g2 === 0) this.airTime = 0;
    if (g2 === 0) this.airTime += DT;
    if (this.wasGrounded === 0 && g2 > 0 && this.airTime > 0.25) this.events.push({ t: 'land', v: Math.abs(this.chassis.getLinearVelocity().y), air: this.airTime });
    if (this.wasGrounded > 0 && g2 === 0 && this.chassis.getLinearVelocity().y > 2.5) this.events.push({ t: 'jump' });
    this.wasGrounded = g2;
    this.checkEnd();
  };

  Sim.prototype.checkEnd = function () {
    const def = this.def, ch = this.chassis;
    const p = ch.getPosition();
    this.maxX = Math.max(this.maxX, p.x);
    const cliff = def.cliffX != null && p.x > def.cliffX - 0.5;
    const gapHere = def.gaps.find(g => p.x > g.x0 - 1.2 && p.x < g.x1 + 1.0);
    const inGap = !!(gapHere && p.y < groundYAt(def.t.pieces, gapHere.x0 - 0.5) + 0.8);
    const nearGate = this.gates.find(g => !g.open && Math.abs(p.x - g.def.x) < 1.6);
    const fail = (kind, extra) => {
      const k = kind === 'ceil' ? 'ceil' : cliff ? 'cliff' : inGap ? 'gap' : (kind === 'gate' || nearGate) ? 'gate' : kind;
      this.result = Object.assign({ ok: false, kind: k, speed: this.speed(), x: p.x, y: p.y }, extra || {});
      this.events.push({ t: 'crash', kind: k });
    };
    if (this.crashKind) { fail(this.crashKind === 'ceil' ? 'ceil' : this.crashKind === 'gate' ? 'gate' : 'crash'); return; }
    const gapFloor = gapHere ? (gapHere.deep ? Math.min(groundYAt(def.t.pieces, gapHere.x0 - 0.5), groundYAt(def.t.pieces, gapHere.x1 + 0.5)) : groundYAt(def.t.pieces, gapHere.x0 - 0.5)) - 3 : 0;
    if (p.y < this.killY || (inGap && p.y < gapFloor)) { fail(cliff ? 'cliff' : 'gap'); return; }
    const inLoop = this.loops.some(L => (L.passed && !L.done) || (p.x > L.x0 - 1.5 && p.x < L.x1 + 1.5 && p.y > L.y0 + R + 0.25));
    let a = ch.getAngle() % (2 * Math.PI);
    if (a > Math.PI) a -= 2 * Math.PI; if (a < -Math.PI) a += 2 * Math.PI;
    this.upsideTime = Math.abs(a) > 2.0 && !inLoop ? this.upsideTime + DT : 0;
    if (this.upsideTime > 0.4) { fail('crash'); return; }
    const ya = groundYAt(def.t.pieces, p.x - 0.5), yb = groundYAt(def.t.pieces, p.x + 0.5);
    if (ya != null && yb != null && this.grounded() > 0 && !gapHere && !inLoop) {
      const rel = a - Math.atan2(yb - ya, 1);
      if (Math.abs(rel) > 45 * Math.PI / 180) { fail('crash', { pitch: rel }); return; }
    }
    if (def.finish != null && this.frontX() >= def.finish) { this.result = { ok: true, time: this.time }; this.events.push({ t: 'finish' }); return; }
    if (def.stopZone) {
      const z = def.stopZone;
      const inZone = this.rearX() >= z.x0 && this.frontX() <= z.x1 && this.grounded() === 2;
      this.stopTime = inZone && this.speed() < 0.3 ? this.stopTime + DT : 0;
      if (this.stopTime > 0.6) { this.result = { ok: true, time: this.time - 0.6 }; this.events.push({ t: 'finish' }); return; }
    }
    this.backTime = this.vx() < -0.4 ? this.backTime + DT : 0;
  };

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
      speed: this.speed(), vx: this.vx(), grounded: this.grounded(), time: this.time, wind: this.windNow,
      gates: this.gates.map(g => g.open), surf: this.surfNow || null
    };
  };
  Sim.prototype.drainEvents = function () { const e = this.events; this.events = []; return e; };

  const api = { Sim, STAGES, WORLDS, PAR, stars, LAB, IS_LAB, G, MAX_TILT, R, groundYAt, stageCount: STAGES.length };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TiltCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
