// 2.0 판 데이터 만들기: 모범 운전이 지나간 길에 코인, 모범 운전 기록으로 미션 값 → src/stagedata.js
// node test/gen-v2.js
const fs = require('fs'), path = require('path');
const out = path.join(__dirname, '../src/stagedata.js');
fs.writeFileSync(out, wrap({ coins: {}, missions: {} }));            // 코인 없이 다시 계산
delete require.cache[require.resolve('../src/core.js')];
const C = require('../src/core.js');
const { STAGE_POLICIES } = require('./policies.js');
const D = Math.PI / 180;
function wrap(data) { return '// 자동 생성: test/gen-v2.js (판별 코인 위치·미션). 직접 고치지 말 것\n(function (root) {\n  const D = ' + JSON.stringify(data) + ';\n  if (typeof module !== \'undefined\' && module.exports) module.exports = D; else root.TILT_STAGEDATA = D;\n})(typeof window !== \'undefined\' ? window : globalThis);\n'; }
function run(i, pol) {
  const s = new C.Sim(i), m = s.def.t.marks, z = s.def.stopZone, gates = s.def.gates.map(g => g.zone), path = [];
  while (!s.result && s.time < 70) {
    const sn = s.snapshot();
    if (pol.jump && pol.jump(sn, m, s)) s.jump();
    s.step(pol(sn, m, z, gates, s) * D, 1 / 60);
    const p = s.chassis.getPosition(); path.push([p.x, p.y]);
  }
  return { ok: s.result && s.result.ok, time: s.time, stats: s.stats, path, def: s.def };
}
const data = { coins: {}, missions: {} };
for (let i = 0; i < C.stageCount; i++) {
  const runs = Object.values(STAGE_POLICIES[i].good).map(p => run(i, p)).filter(r => r.ok);
  const best = runs.reduce((a, b) => (a.time <= b.time ? a : b));
  const d = best.def, x0 = d.start + 5, x1 = d.finish != null ? d.finish - 1 : d.stopZone.x0 - 1;
  // 코인: 3개씩 묶음(1.3m 간격), 묶음 사이 약 9m. 모범 운전 위치 + 0.5m(줍는 높이)
  const coins = [];
  let nextX = x0;
  for (const [x, y] of best.path) {
    if (x < nextX || x > x1) continue;
    const k = coins.length % 3;
    coins.push([+x.toFixed(2), +(y + 0.5).toFixed(2)]);
    nextX = x + (k === 2 ? 9 : 1.3);
  }
  data.coins[d.id] = coins;
  // 미션 2: 판 성격에 맞춰, 모범 운전들 중 가장 좋은 값보다 조금 낮게
  const mx = f => Math.max(...runs.map(f));
  const stopLike = d.stopZone || d.tunnel || d.gates.length;
  let m2;
  if ((d.fx) && mx(r => r.stats.perfect) >= 2) m2 = { k: 'perfect', v: Math.min(3, mx(r => r.stats.perfect)) };
  else if (stopLike) m2 = { k: 'top', v: Math.floor(mx(r => r.stats.maxSp) * 0.95 * 2) / 2 };
  else if (mx(r => r.stats.air) > 1.2) m2 = { k: 'air', v: Math.floor(mx(r => r.stats.air) * 0.85 * 10) / 10 };
  else if (runs.some(r => r.stats.minPhi > -2 * D)) m2 = { k: 'nobrake' };
  else m2 = { k: 'top', v: Math.floor(mx(r => r.stats.maxSp) * 0.95 * 2) / 2 };
  data.missions[d.id] = [{ k: 'coins' }, m2];
  console.log(d.id.padEnd(4), 'coins', String(coins.length).padStart(2), 'm2', JSON.stringify(m2), 'best', best.time.toFixed(1) + 's');
}
fs.writeFileSync(out, wrap(data));
// 검증: 모범 운전이 코인을 전부 줍고, 미션 2를 실제로 깰 수 있는지
delete require.cache[require.resolve('../src/core.js')]; delete require.cache[require.resolve('../src/stagedata.js')];
const C2 = require('../src/core.js'); let bad = 0;
for (let i = 0; i < C2.stageCount; i++) {
  const pols = Object.values(STAGE_POLICIES[i].good); let coinsOk = false, m2Ok = false;
  for (const pol of pols) {
    const s = new C2.Sim(i), m = s.def.t.marks, z = s.def.stopZone, gates = s.def.gates.map(g => g.zone);
    while (!s.result && s.time < 70) { const sn = s.snapshot(); if (pol.jump && pol.jump(sn, m, s)) s.jump(); s.step(pol(sn, m, z, gates, s) * D, 1 / 60); }
    if (s.missionDone(s.def.missions[0])) coinsOk = true; if (s.missionDone(s.def.missions[1])) m2Ok = true;
  }
  if (!coinsOk || !m2Ok) { bad++; console.log('✗', C2.STAGES[i]().id, 'coins', coinsOk, 'm2', m2Ok); }
}
console.log(bad ? '미션 검증 실패 ' + bad : '모든 판: 모범 운전으로 코인 전부·미션 2 달성 가능');
