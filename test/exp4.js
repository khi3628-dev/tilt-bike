// 4판 장애물 후보 실험: 속도별로 천장에 머리를 박는지
const core = require('../src/core.js');
const D = Math.PI / 180;
const { Sim, STAGES } = core;

function design(kind, H) {
  return function () {
    const T = Object.getPrototypeOf(STAGES[0]().t).constructor;
    const t = new T(0, 0);
    t.go(6, 0).go(22, -14, 4).go(14, 0, 4).mark('bumps');
    if (kind === 'sine') t.bumps(4, 3, 0.45);
    if (kind === 'kick') { for (let i = 0; i < 3; i++) t.kicker(0.5, 1.3, 0.5, 1.3).go(2.5, 0, 0.3); }
    if (kind === 'kick2') { for (let i = 0; i < 3; i++) t.kicker(0.45, 1.0, 0.3, 1.6).go(2.2, 0, 0.3); }
    t.mark('bumpsEnd').go(18, 0, 0).mark('end');
    const b = t.marks.bumps, e = t.marks.bumpsEnd;
    const ceil = [[b.x - 3, b.y + H + 2.5], [b.x - 1.2, b.y + H + 0.3], [b.x, b.y + H], [e.x, e.y + H], [e.x + 1.2, e.y + H + 0.3], [e.x + 3, e.y + H + 2.5]];
    return { name: 'x', hint: '', t, start: 3, finish: t.marks.end.x - 8, signs: [], ceil: [ceil] };
  };
}

for (const [kind, H] of [['sine', 2.55], ['kick', 2.6], ['kick', 2.75], ['kick2', 2.6], ['kick2', 2.75]]) {
  STAGES[3] = design(kind, H);
  const row = [];
  for (const v of [1.5, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14]) {
    const s = new Sim(3);
    const m = s.def.t.marks;
    let entry = null;
    while (!s.result && s.time < 60) {
      const x = s.chassis.getPosition().x;
      const vx = s.vx();
      const deg = x < m.bumps.x - 14 ? 25 : Math.max(-25, Math.min(25, 8 * (v - vx)));
      if (entry == null && x > m.bumps.x - 1) entry = s.speed();
      s.step(deg * D, 1 / 60);
    }
    const r = s.result || { ok: false, kind: 'timeout' };
    row.push(`${v}:${r.ok ? 'ok' : r.kind}(${entry ? entry.toFixed(1) : '-'})`);
  }
  console.log(kind.padEnd(6), H, row.join(' '));
}
