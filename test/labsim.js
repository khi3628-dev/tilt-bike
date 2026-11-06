// 실험 코스 시뮬: node test/labsim.js
globalThis.TILT_LAB = true;
const { Sim, STAGES } = require('../src/core.js');
const D = Math.PI / 180, clamp = v => Math.max(-25, Math.min(25, v));
function run(i, pol, jumpAt) {
  const s = new Sim(i), m = s.def.t.marks; let maxSp = 0, jumps = 0, surfT = {};
  while (!s.result && s.time < 60) {
    const sn = s.snapshot();
    if (jumpAt && jumpAt(sn, m, s)) { if (s.jump()) jumps++; }
    s.step(pol(sn, m) * D, 1 / 60); maxSp = Math.max(maxSp, s.speed());
    if (s.surfNow) surfT[s.surfNow] = (surfT[s.surfNow] || 0) + 1 / 60;
  }
  const r = s.result || { ok: false, kind: 'timeout' };
  return (r.ok ? 'OK  ' : 'FAIL ' + r.kind) + ` t=${s.time.toFixed(1)} max=${maxSp.toFixed(1)} x=${s.chassis.getPosition().x.toFixed(1)}${jumps ? ' jumps=' + jumps : ''} ${JSON.stringify(Object.fromEntries(Object.entries(surfT).map(([k, v]) => [k, +v.toFixed(1)])))}`;
}
const near = (key, d0, d1) => (sn, m) => sn.x > m[key].x - d0 && sn.x < m[key].x - d1;
const C = c => () => c, T = (v) => (sn) => clamp(8 * (v - sn.vx));
const STOP = (xc) => (sn) => clamp(10 * (Math.max(-1.5, Math.min(5, 0.9 * (xc - sn.x))) - sn.vx));
const cases = [
  [0, [['25°', C(25)], ['10°', C(10)], ['0°', C(0)]]],
  [1, [['25°', C(25)], ['12°', C(12)], ['5°', C(5)]]],
  [2, [['25°', C(25)], ['12°', C(12)]]],
  [3, [['20° 점프 없음', C(20)], ['20° + 점프', C(20), (sn, m) => ['b1', 'b2', 'b3'].some(k => sn.x > m[k].x - 2.6 && sn.x < m[k].x - 1.6) || (sn.x > m.j.x - 1.6 && sn.x < m.j.x - 0.6)]]],
  [4, [['25°', C(25)], ['15°', C(15)], ['25° + 둘째 점프', C(25), (sn, m) => sn.x > m.lip2.x - 0.8 && sn.x < m.lip2.x], ['15° + 둘째 점프', C(15), (sn, m) => sn.x > m.lip2.x - 0.8 && sn.x < m.lip2.x], ['20° 일찍 점프', C(20), (sn, m) => sn.x > m.lip2.x - 2.5 && sn.x < m.lip2.x - 1.5]]],
  [5, [['모범', (sn, m) => sn.x < m.lip.x + 8 ? 25 : sn.x < m.bumpsEnd.x ? clamp(8 * (4 - sn.vx)) : sn.x < m.plateau.x - 4 ? 22 : 0]]],
  [6, [['25°', C(25)], ['8°', C(8)]]],
  [7, [['25°', C(25)], ['15°', C(15)], ['8°', C(8)]]],
  [8, [['25°', C(25)], ['15°', C(15)], ['8°', C(8)]]]
];
for (const [i, list] of cases) {
  const s0 = new Sim(i); console.log(`\n=== ${s0.def.id} ${s0.def.name.ko}`);
  for (const [n, pol, j] of list) {
    let p = pol;
    if (i === 5 && n === '모범') { const z = s0.def.stopZone; p = (sn, m) => sn.x < m.plateau.x - 4 ? pol(sn, m) : STOP((z.x0 + z.x1) / 2)(sn); }
    console.log('  ' + n.padEnd(16) + run(i, p, j));
  }
}
