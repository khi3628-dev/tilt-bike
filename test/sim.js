// 헤드리스 시뮬레이션: 기울기 전략별로 판 결과를 확인
// node test/sim.js [판번호]   /   node test/sim.js check  (기대 결과와 다르면 exit 1)
const { Sim, stageCount } = require('../src/core.js');
const D = Math.PI / 180;

function run(stage, policy, maxT = 60) {
  const s = new Sim(stage);
  let maxSp = 0, backHint = false;
  const dt = 1 / 60;
  while (!s.result && s.time < maxT) {
    const deg = policy(s.snapshot(), s);
    s.step(deg * D, dt);
    maxSp = Math.max(maxSp, s.speed());
    if (s.backTime > 1.2) backHint = true;
  }
  const r = s.result || { ok: false, kind: 'timeout' };
  return { ...r, t: +s.time.toFixed(1), maxSp: +maxSp.toFixed(1), x: +s.chassis.getPosition().x.toFixed(1), backHint };
}
const clamp = v => Math.max(-25, Math.min(25, v));
const constTilt = c => () => c;
const target = (v, k = 8) => (snap) => clamp(k * (v - snap.vx));
const phased = (list) => (snap) => {
  for (const [xEnd, pol] of list) if (snap.x < xEnd) return pol(snap);
  return list[list.length - 1][1](snap);
};
const stopAt = (zc) => (snap) => clamp(10 * (Math.max(-1.5, Math.min(5, 0.9 * (zc - snap.x))) - snap.vx));

// 판별 시나리오: [이름, 전략, 기대(ok | 실패 kind 목록)]
function scenarios(i) {
  const s0 = new Sim(i); const m = s0.def.t.marks, z = s0.def.stopZone;
  const L = [];
  if (i === 0) {
    L.push(['안 기울임', constTilt(0), 'timeout']);
    L.push(['살짝 8°', constTilt(8), 'ok']);
    L.push(['끝까지 25°', constTilt(25), 'ok']);
    L.push(['반대로 -10°', constTilt(-10), 'timeout']);
  }
  if (i === 1) {
    L.push(['살짝 8°', constTilt(8), 'timeout']);
    L.push(['계속 20°', constTilt(20), 'ok']);
    L.push(['끝까지 25°', constTilt(25), 'ok']);
    L.push(['내리막 25° → 오르막 앞에서 0°', phased([[m.hill.x - 2, constTilt(25)], [1e9, constTilt(0)]]), 'timeout']);
  }
  if (i === 2) {
    L.push(['살짝 6°', constTilt(6), 'gap']);
    L.push(['틈 앞에서 4m/s', phased([[m.sign.x - 12, constTilt(15)], [1e9, target(4)]]), 'gap']);
    L.push(['계속 15°', constTilt(15), 'ok']);
    L.push(['끝까지 25°', constTilt(25), 'ok']);
  }
  if (i === 3) {
    L.push(['브레이크 없이 20°', constTilt(20), 'crash|ceil']);
    L.push(['살짝 8°', constTilt(8), 'crash|ceil']);
    L.push(['터널 앞에서 4m/s로 줄임', phased([[m.bumps.x - 16, constTilt(20)], [m.bumpsEnd.x, target(4)], [1e9, constTilt(15)]]), 'ok']);
    L.push(['터널 앞에서 2.5m/s로 줄임', phased([[m.bumps.x - 16, constTilt(20)], [m.bumpsEnd.x, target(2.5)], [1e9, constTilt(15)]]), 'ok']);
    L.push(['터널 앞에서 7.5m/s', phased([[m.bumps.x - 16, constTilt(20)], [m.bumpsEnd.x, target(7.5)], [1e9, constTilt(15)]]), 'crash|ceil']);
  }
  if (i === 4) {
    const good = (vb, stop) => phased([[m.bumps.x - 16, constTilt(18)], [m.bumpsEnd.x, target(vb)], [m.lip.x + 8, constTilt(25)], [m.plateau.x - 6, target(7)], [1e9, stop ? stopAt((z.x0 + z.x1) / 2) : target(6)]]);
    L.push(['모범 (터널 4m/s, 점프 25°, 깃발 사이 멈춤)', good(4, true), 'ok']);
    L.push(['모범 (터널 3m/s)', good(3, true), 'ok']);
    L.push(['안 멈춤', good(4, false), 'cliff']);
    L.push(['터널에서 안 줄임', phased([[m.lip.x, constTilt(18)], [1e9, stopAt((z.x0 + z.x1) / 2)]]), 'crash|ceil']);
    L.push(['점프 때 느림 (4m/s)', phased([[m.bumps.x - 16, constTilt(18)], [m.bumpsEnd.x, target(4)], [1e9, target(4)]]), 'gap']);
  }
  return L;
}

function fmt(r) {
  return (r.ok ? 'OK  ' : 'FAIL') + ` ${(r.kind || '').padEnd(7)} t=${r.t}s max=${r.maxSp}m/s x=${r.x}${r.backHint ? ' (뒤로밀림)' : ''}`;
}

const arg = process.argv[2];
const only = arg && arg !== 'check' ? [+arg - 1] : [...Array(stageCount).keys()];
let bad = 0;
for (const i of only) {
  const s0 = new Sim(i);
  const m = s0.def.t.marks;
  console.log(`\n=== ${i + 1}판 ${s0.def.name} — ${Object.entries(m).map(([k, v]) => k + '=' + v.x.toFixed(1)).join(' ')}`);
  for (const [name, pol, expect] of scenarios(i)) {
    const r = run(i, pol);
    const got = r.ok ? 'ok' : r.kind;
    const pass = expect.split('|').includes(got);
    if (!pass) bad++;
    console.log(`  ${pass ? '✓' : '✗'} ${name.padEnd(28)} 기대=${expect.padEnd(10)} ${fmt(r)}`);
  }
}
console.log(bad ? `\n기대와 다름: ${bad}개` : '\n모든 시나리오가 기대대로');
if (arg === 'check' && bad) process.exit(1);
