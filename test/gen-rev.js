// 거꾸로 판: 깰 수 있는지 여러 운전을 조합해 찾고, 기준 시간을 src/stagedata.js의 rev에 저장
// node test/gen-rev.js
const fs = require('fs'), path = require('path');
const C = require('../src/core.js');
const SDp = path.join(__dirname, '../src/stagedata.js'); const SD = require(SDp);
const D = Math.PI / 180, clamp = v => Math.max(-25, Math.min(25, v));
function policy(def, a, vt, pil) {
  const tun = def.tunnel, ceilX = def.ceil.length ? [Math.min(...def.ceil.map(c => c[0][0])), Math.max(...def.ceil.map(c => c[c.length - 1][0]))] : null;
  const zone = tun || ceilX;
  const f = (sn, s) => {
    if (pil && s.inAir && s.grounded() === 0) {
      const P = s.def.t.pieces, x = sn.x + Math.max(1, sn.vx * 0.35), ya = C.groundYAt(P, x - 0.5), yb = C.groundYAt(P, x + 0.5);
      const sl = ya != null && yb != null ? Math.atan2(yb - ya, 1) : 0; let e = sn.angle - sl; e = Math.atan2(Math.sin(e), Math.cos(e));
      return clamp(s.phiRef / D + 60 * e + 6 * s.chassis.getAngularVelocity());
    }
    if (vt && zone && sn.x > zone[0] - 14 && sn.x < zone[1]) return clamp(8 * (vt - sn.vx));
    return a;
  };
  f.jump = (sn, s) => s.def.gaps.some(g => { const tt = (g.x0 - sn.x) / Math.max(1, sn.vx); return tt < 0.1 && tt > 0.0; }) || s.def.blocks.some(b => { const tt = (b.x0 - sn.x) / Math.max(1, sn.vx); return tt < 0.32 && tt > 0.2; });
  return f;
}
function run(i, pol) {
  const s = new C.Sim(i, { reverse: true });
  while (!s.result && s.time < 60) { const sn = s.snapshot(); if (pol.jump(sn, s)) s.jump(); s.step(pol(sn, s) * D, 1 / 60); }
  return s.result && s.result.ok ? s.time : null;
}
SD.rev = {}; const report = [];
for (let i = 0; i < C.stageCount; i++) {
  const d = C.STAGES[i](); if (!C.canReverse(d)) { report.push(d.id + 'R  — 검문소 판, 거꾸로 없음'); continue; }
  const rd = C.mirrorDef(d); let best = null, wins = 0, how = '';
  for (const a of [25, 20, 15, 10]) for (const vt of [null, 4, 3]) for (const pil of [false, true]) {
    if (vt && !(rd.tunnel || rd.ceil.length)) continue;
    const t = run(i, policy(rd, a, vt, pil)); if (t != null) { wins++; if (best == null || t < best) { best = t; how = a + '°' + (vt ? ' 터널' + vt + 'm/s' : '') + (pil ? ' 공중조작' : ''); } }
  }
  if (best != null && wins >= 2) { SD.rev[rd.id] = Math.ceil(best * 1.1 * 2) / 2; report.push(rd.id.padEnd(5) + ' 가능 (' + wins + '가지 운전) 최단 ' + best.toFixed(1) + 's [' + how + '] → 기준 ' + SD.rev[rd.id] + 's'); }
  else report.push(rd.id.padEnd(5) + (best != null ? ' 한 가지 운전만 성공 → 너무 빡빡해서 뺌' : ' 못 깸 → 뺌'));
}
fs.writeFileSync(SDp, '// 자동 생성: test/gen-v2.js (판별 코인 위치·미션), test/gen-rev.js (거꾸로 기준 시간). 직접 고치지 말 것\n(function (root) {\n  const D = ' + JSON.stringify(SD) + ';\n  if (typeof module !== \'undefined\' && module.exports) module.exports = D; else root.TILT_STAGEDATA = D;\n})(typeof window !== \'undefined\' ? window : globalThis);\n');
console.log(report.join('\n')); console.log('거꾸로 가능', Object.keys(SD.rev).length + '판');
