// 헤드리스 시뮬레이션: 판별 모범/실패 운전 검증.  node test/sim.js [판번호] | check | par
const { Sim, stageCount, PAR } = require('../src/core.js');
const BIKE = process.env.BIKE || 'city';
const { STAGE_POLICIES } = require('./policies.js');
const D = Math.PI / 180;

function run(stage, policy, maxT = 70) {
  const s = new Sim(stage, { bike: BIKE });
  const m = s.def.t.marks, z = s.def.stopZone, gates = s.def.gates.map(g => g.zone);
  let maxSp = 0, backHint = false;
  while (!s.result && s.time < maxT) {
    const sn = s.snapshot();
    if (policy.jump && policy.jump(sn, m, s)) s.jump();
    s.step(policy(sn, m, z, gates, s) * D, 1 / 60);
    maxSp = Math.max(maxSp, s.speed());
    if (s.backTime > 1.2) backHint = true;
  }
  const r = s.result || { ok: false, kind: 'timeout' };
  return { ...r, t: +s.time.toFixed(1), maxSp: +maxSp.toFixed(1), x: +s.chassis.getPosition().x.toFixed(1), backHint };
}
const fmt = r => (r.ok ? 'OK  ' : 'FAIL') + ` ${(r.kind || '').padEnd(7)} t=${r.t}s max=${r.maxSp}m/s x=${r.x}${r.backHint ? ' (뒤로밀림)' : ''}`;

const arg = process.argv[2];
const only = arg && !isNaN(+arg) ? [+arg - 1] : [...Array(stageCount).keys()];
let bad = 0; const pars = [];
for (const i of only) {
  const s0 = new Sim(i), m = s0.def.t.marks, sp = STAGE_POLICIES[i];
  console.log(`\n=== ${s0.def.id} ${s0.def.name.ko} — ${Object.entries(m).map(([k, v]) => k + '=' + v.x.toFixed(1)).join(' ')}`);
  let best = Infinity;
  for (const [name, pol] of Object.entries(sp.good)) {
    const r = run(i, pol); const pass = r.ok; if (!pass) bad++;
    if (r.ok) best = Math.min(best, r.t);
    console.log(`  ${pass ? '✓' : '✗'} ${name.padEnd(26)} 기대=ok         ${fmt(r)}`);
  }
  for (const [name, pol, expect] of sp.bad) {
    const r = run(i, pol); const got = r.ok ? 'ok' : r.kind; const pass = expect.split('|').includes(got); if (!pass) bad++;
    console.log(`  ${pass ? '✓' : '✗'} ${name.padEnd(26)} 기대=${expect.padEnd(10)} ${fmt(r)}`);
  }
  const par = Math.ceil(best * 1.1 * 2) / 2;
  pars.push(par);
  console.log(`  모범 최단 ${best}s → 기준 ${par}s (코드 PAR ${PAR[i]}) ${Math.abs(par - PAR[i]) > 0.01 ? '← 다름' : ''}`);
}
if (arg === 'par') console.log('\nPAR = [' + pars.join(', ') + ']');
console.log(bad ? `\n기대와 다름: ${bad}개` : '\n모든 시나리오가 기대대로');
if (arg === 'check' && bad) process.exit(1);
