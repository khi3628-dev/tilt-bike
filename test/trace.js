// 한 전략의 궤적을 0.1초마다 찍어 봄: node test/trace.js <판> <고정각|v목표> [xFrom]
const { Sim, groundYAt } = require('../src/core.js');
const D = Math.PI / 180;
const [stage, mode, xFrom = '0'] = process.argv.slice(2);
const s = new Sim(+stage - 1);
const pol = mode.startsWith('v') ? (snap) => Math.max(-25, Math.min(25, 8 * (+mode.slice(1) - snap.vx))) : () => +mode;
let next = 0;
while (!s.result && s.time < 40) {
  const snap = s.snapshot();
  s.step(pol(snap) * D, 1 / 60);
  if (s.time >= next) {
    next += 0.1;
    if (snap.x < +xFrom) continue;
    const ch = s.chassis;
    const head = ch.getWorldPoint({ x: 0.1, y: 1.32 });
    const gy = groundYAt(s.def.t.pieces, head.x);
    console.log(`t=${s.time.toFixed(1)} x=${snap.x.toFixed(1)} y=${snap.y.toFixed(2)} ang=${(snap.angle / D).toFixed(0)} v=${snap.speed.toFixed(1)} gnd=${snap.grounded} headAboveGround=${gy == null ? '-' : (head.y + 0.16 - gy).toFixed(2)}`);
  }
}
console.log('RESULT', s.result);
