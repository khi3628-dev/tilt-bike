const { Sim, stageCount } = require('../src/core.js');
const { clamp } = require('./policies.js');
const D = Math.PI / 180;
function run(i, pol) { const s = new Sim(i); const m = s.def.t.marks; while (!s.result && s.time < 60) s.step(pol(s.snapshot(), m) * D, 1 / 60); return s.result ? (s.result.ok ? 'ok' : s.result.kind.slice(0, 4)) : 'time'; }
for (let i = 0; i < stageCount; i++) {
  const s0 = new Sim(i);
  const row = []; for (let c = 0; c <= 25; c += 1) row.push(c + ':' + run(i, () => c));
  console.log(`${s0.def.id} 고정각`, row.join(' '));
}
// 브레이크 시작점 훑기 (턱 앞 몇 m부터 -25°로 꺾고 4m/s 유지)
for (const [i, ref] of [[3, 'bumps'], [8, 'bumps'], [12, 'bumps'], [7, 'bumps']]) {
  const s0 = new Sim(i), m = s0.def.t.marks; const row = [];
  for (let d = 2; d <= 40; d += 2) row.push(d + 'm:' + run(i, (s) => s.x < m[ref].x - d ? 20 : s.x < m.bumpsEnd.x ? clamp(8 * (4 - s.vx)) : 25));
  console.log(`${s0.def.id} 턱 앞 몇 m부터 브레이크`, row.join(' '));
}
// 다리: 다리 앞 목표 속도
for (const i of [6, 13]) {
  const s0 = new Sim(i), m = s0.def.t.marks; const row = [];
  for (let v = 6; v <= 16; v += 1) row.push(v + ':' + run(i, (s) => s.gates && s.gates.length && !s.gates[0] ? clamp(10 * (Math.max(-1.5, Math.min(5, 0.9 * ((m.z0.x + m.gate1.x - 0.6) / 2 - s.x))) - s.vx)) : (s.x < m.b0.x - 12 ? 25 : s.x < m.b1.x ? clamp(8 * (v - s.vx)) : 25)));
  console.log(`${s0.def.id} 다리 속도`, row.join(' '));
}
