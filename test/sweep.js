// 문턱값 훑기: 고정 기울기 / 목표 속도별 결과 한 줄로
const { Sim } = require('../src/core.js');
const D = Math.PI / 180;
function run(i, pol) { const s = new Sim(i); while (!s.result && s.time < 60) s.step(pol(s.snapshot(), s) * D, 1 / 60); return s.result ? (s.result.ok ? 'ok' : s.result.kind) : 'time'; }
const clamp = v => Math.max(-25, Math.min(25, v));
for (const i of [0, 1, 2, 3]) {
  const row = []; for (let c = 0; c <= 25; c += 1) row.push(c + ':' + run(i, () => c)); console.log(`${i + 1}판 고정각 `, row.join(' '));
}
{ // 4판: 터널 앞에서 목표 속도
  const s0 = new Sim(3), m = s0.def.t.marks; const row = [];
  for (let v = 1; v <= 13; v += 0.5) row.push(v + ':' + run(3, snap => snap.x < m.bumps.x - 16 ? 20 : snap.x < m.bumpsEnd.x ? clamp(8 * (v - snap.vx)) : 15));
  console.log('4판 터널속도', row.join(' '));
}
{ // 3판: 틈 앞 9m 동안 목표 속도
  const s0 = new Sim(2), m = s0.def.t.marks; const row = [];
  for (let v = 4; v <= 16; v += 1) row.push(v + ':' + run(2, snap => snap.x < m.sign.x - 9 ? 25 : clamp(8 * (v - snap.vx))));
  console.log('3판 점프속도', row.join(' '));
}
