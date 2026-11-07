// 레이스 규칙 시험: node race/test-race.js
const RC = require('./race-core.js');
let bad = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) bad++; };
// 높낮이
let minV = 1e9; const hs = []; for (let x = 0; x <= RC.FINISH; x += 10) hs.push(RC.heightAt(x).toFixed(1));
console.log('높이(10m마다):', hs.join(' '));
const wins = [0, 0, 0, 0, 0], places = []; let bumps = 0, walls = 0, stallRaces = 0, times = [];
for (let seed = 1; seed <= 20; seed++) {
  const r = new RC.Race({ seed, autoPlayer: true });
  let minRaceV = 1e9, hillV = [1e9, 1e9];
  while (r.finished.length < r.riders.length && r.time < 90) {
    r.step(1 / 60, 0);
    for (const e of r.drain()) { if (e.t === 'bump') bumps++; else if (e.t === 'wall') walls++; }
    if (r.time > 2) for (const q of r.riders) { if (q.finish != null) continue; const v = q.b.getLinearVelocity().x, x = q.b.getPosition().x; minRaceV = Math.min(minRaceV, v); if (x > 105 && x < 112) hillV[0] = Math.min(hillV[0], v); if (x > 268 && x < 275) hillV[1] = Math.min(hillV[1], v); }
  }
  const rk = r.rank(); wins[rk[0].i]++; places.push(rk.map(q => q.i).join(''));
  times.push(r.riders.map(q => q.finish).filter(t => t != null));
  if (minRaceV <= 1.6) stallRaces++;
  if (seed <= 5) console.log('  경주', seed, '순위', rk.map(q => q.name.ko).join('>'), '기록', rk.map(q => q.finish && q.finish.toFixed(1)).join(' '), '최저속도', minRaceV.toFixed(1), '언덕꼭대기 최저', hillV.map(v => v.toFixed(1)).join('/'));
}
const all = times.flat();
ok(times.every(t => t.length === 5), '20경주 모두 5명 완주');
ok(Math.min(...all) > 18 && Math.max(...all) < 45, '기록 ' + Math.min(...all).toFixed(1) + '~' + Math.max(...all).toFixed(1) + '초');
ok(new Set(places).size >= 8, '순위가 섞임: 서로 다른 순위 ' + new Set(places).size + '가지, 1등 횟수 ' + wins.join('/'));
ok(bumps > 20, '선수끼리 부딪힘 ' + bumps + '번 (벽 ' + walls + '번)');
ok(stallRaces === 0, '언덕에서 거의 멈춘 경주 ' + stallRaces);
console.log(bad ? '실패 ' + bad : '모두 통과');
