// 판별 모범 운전 + 실패 운전 (시뮬·브라우저 검증 공용). 브라우저용은 문자열로도 내보냄.
const clamp = v => Math.max(-25, Math.min(25, v));
const T = (v, k = 8) => (s) => clamp(k * (v - s.vx));               // 목표 속도 유지
const C = (c) => () => c;                                            // 고정 기울기
const STOP = (xc) => (s) => clamp(10 * (Math.max(-1.5, Math.min(5, 0.9 * (xc - s.x))) - s.vx)); // xc에 멈추기
// STOP.z = 정지 구역 가운데, STOP.g0/g1 = 검문소 구역 가운데
STOP.z = (s, m, z) => STOP((z.x0 + z.x1) / 2)(s);
STOP.g0 = (s, m, z, gates) => s.gates[0] ? 25 : STOP((gates[0].x0 + gates[0].x1) / 2)(s);
STOP.g1 = (s, m, z, gates) => s.gates[1] ? 25 : STOP((gates[1].x0 + gates[1].x1) / 2)(s);
const P = (list) => (s, m, z, g) => { for (const [xEnd, pol] of list) if (s.x < xEnd(m, z)) return pol(s, m, z, g); return list[list.length - 1][1](s, m, z, g); };
const X = (f) => (m, z) => f(m, z);

// 각 판: good = 성공해야 하는 운전들, bad = [이름, 운전, 기대 실패 종류(|로 여럿)]
const STAGE_POLICIES = [
  { good: { '끝까지 25°': C(25), '살짝 8°': C(8) }, bad: [['안 기울임', C(0), 'timeout'], ['반대로 -10°', C(-10), 'timeout']] },
  { good: { '계속 20°': C(20), '끝까지 25°': C(25) }, bad: [['살짝 8°', C(8), 'timeout'], ['오르막 앞에서 0°', P([[X(m => m.hill.x - 2), C(25)], [X(() => 1e9), C(0)]]), 'timeout']] },
  { good: { '끝까지 25°': C(25), '계속 15°': C(15) }, bad: [['살짝 6°', C(6), 'gap'], ['틈 앞에서 4m/s', P([[X(m => m.sign.x - 12), C(15)], [X(() => 1e9), T(4)]]), 'gap|crash']] },
  { good: { '터널 4m/s': P([[X(m => m.bumps.x - 16), C(20)], [X(m => m.bumpsEnd.x), T(4)], [X(() => 1e9), C(15)]]), '터널 2.5m/s': P([[X(m => m.bumps.x - 16), C(20)], [X(m => m.bumpsEnd.x), T(2.5)], [X(() => 1e9), C(15)]]) },
    bad: [['브레이크 없이 20°', C(20), 'crash|ceil'], ['살짝 8°', C(8), 'crash|ceil'], ['터널 7.5m/s', P([[X(m => m.bumps.x - 16), C(20)], [X(m => m.bumpsEnd.x), T(7.5)], [X(() => 1e9), C(15)]]), 'crash|ceil']] },
  { good: { '모범': P([[X(m => m.bumps.x - 16), C(18)], [X(m => m.bumpsEnd.x), T(4)], [X(m => m.lip.x + 8), C(25)], [X(m => m.plateau.x - 6), T(7)], [X(() => 1e9), STOP.z]]) },
    bad: [['안 멈춤', P([[X(m => m.bumps.x - 16), C(18)], [X(m => m.bumpsEnd.x), T(4)], [X(m => m.lip.x + 8), C(25)], [X(() => 1e9), T(7)]]), 'cliff'],
      ['터널에서 안 줄임', P([[X(m => m.lip.x), C(18)], [X(() => 1e9), STOP.z]]), 'crash|ceil'],
      ['점프 때 느림', P([[X(m => m.bumps.x - 16), C(18)], [X(() => 1e9), T(4)]]), 'gap|crash']] },
  // 세계 2
  { good: { '계속 20°': C(20), '끝까지 25°': C(25) }, bad: [['살짝 7°', C(7), 'gap|crash'], ['첫 틈 뒤 브레이크', P([[X(m => m.lip1.x + 8), C(25)], [X(() => 1e9), T(3)]]), 'gap|crash']] },
  { good: { '끝까지 25°': C(25), '계속 18°': C(18) }, bad: [['살짝 6°', C(6), 'gap|crash'], ['다리 앞 5m/s', P([[X(m => m.sign.x - 10), C(20)], [X(() => 1e9), T(5)]]), 'gap|crash']] },
  { good: { '동굴 4m/s → 25°': P([[X(m => m.bumps.x - 14), C(20)], [X(m => m.bumpsEnd.x), T(4)], [X(() => 1e9), C(25)]]), '동굴 3m/s → 25°': P([[X(m => m.bumps.x - 14), C(20)], [X(m => m.bumpsEnd.x), T(3)], [X(() => 1e9), C(25)]]) },
    bad: [['브레이크 없이', C(20), 'crash|ceil'], ['동굴 뒤 느림', P([[X(m => m.bumps.x - 14), C(20)], [X(() => 1e9), T(4)]]), 'gap|crash']] },
  { good: { '내려가며 브레이크 4m/s': P([[X(m => m.sign.x), C(15)], [X(m => m.bumpsEnd.x), T(4)], [X(() => 1e9), C(15)]]), '내려가며 3m/s': P([[X(m => m.sign.x), C(15)], [X(m => m.bumpsEnd.x), T(3)], [X(() => 1e9), C(15)]]) },
    bad: [['브레이크 없이 15°', C(15), 'crash|ceil'], ['바닥에서만 브레이크', P([[X(m => m.bottom.x), C(15)], [X(m => m.bumpsEnd.x), T(4)], [X(() => 1e9), C(15)]]), 'crash|ceil']] },
  { good: { '모범': P([[X(m => m.b1.x + 4), C(25)], [X(m => m.bumpsEnd.x), T(4)], [X(m => m.plateau.x - 5), C(22)], [X(() => 1e9), STOP.z]]) },
    bad: [['다리 느림', P([[X(m => m.lip.x + 8), C(25)], [X(() => 1e9), T(5)]]), 'gap|crash'], ['동굴 빠름', P([[X(m => m.plateau.x - 5), C(25)], [X(() => 1e9), STOP.z]]), 'crash|ceil'], ['안 멈춤', P([[X(m => m.b1.x + 4), C(25)], [X(m => m.bumpsEnd.x), T(4)], [X(() => 1e9), C(22)]]), 'cliff']] },
  // 세계 3
  { good: { '끝까지 25°': C(25), '계속 22°': C(22) }, bad: [['살짝 10°', C(10), 'timeout'], ['계속 15°', C(15), 'timeout']] },
  { good: { '멈추고 25°': P([[X(m => m.gate.x), STOP.g0], [X(() => 1e9), C(25)]]) },
    bad: [['안 멈춤 20°', C(20), 'gate|crash'], ['멈춘 뒤 느림', P([[X(m => m.gate.x), STOP.g0], [X(() => 1e9), T(5)]]), 'gap|crash']] },
  { good: { '바람 구간 -25° → 터널 4m/s': P([[X(m => m.w0.x - 2), C(15)], [X(m => m.bumpsEnd.x), T(4)], [X(() => 1e9), C(15)]]), '터널 3m/s': P([[X(m => m.w0.x - 2), C(15)], [X(m => m.bumpsEnd.x), T(3)], [X(() => 1e9), C(15)]]) },
    bad: [['브레이크 없이', C(15), 'crash|ceil'], ['터널 앞에서만 브레이크', P([[X(m => m.w1.x), C(15)], [X(m => m.bumpsEnd.x), T(4)], [X(() => 1e9), C(15)]]), 'crash|ceil']] },
  { good: { '모범': P([[X(m => m.gate1.x), STOP.g0], [X(m => m.b1.x + 6), C(25)], [X(m => m.gate2.x), STOP.g1], [X(() => 1e9), C(25)]]) },
    bad: [['첫 검문소 안 멈춤', C(20), 'gate|crash'], ['다리 느림', P([[X(m => m.gate1.x), STOP.g0], [X(() => 1e9), T(6)]]), 'gap|crash'], ['둘째 검문소 안 멈춤', P([[X(m => m.gate1.x), STOP.g0], [X(() => 1e9), C(25)]]), 'gate|crash']] },
  { good: { '모범': P([[X(m => m.w0.x - 2), C(15)], [X(m => m.bumpsEnd.x), T(4)], [X(m => m.b1.x + 5), C(25)], [X(m => m.gate.x), STOP.g0], [X(m => m.plateau.x - 4), C(25)], [X(() => 1e9), STOP.z]]) },
    bad: [['터널 빠름', P([[X(m => m.b1.x + 5), C(20)], [X(m => m.gate.x), STOP.g0], [X(m => m.plateau.x - 4), C(25)], [X(() => 1e9), STOP.z]]), 'crash|ceil'],
      ['검문소 안 멈춤', P([[X(m => m.w0.x - 2), C(15)], [X(m => m.bumpsEnd.x), T(4)], [X(() => 1e9), C(25)]]), 'gate|crash'],
      ['안 멈춤', P([[X(m => m.w0.x - 2), C(15)], [X(m => m.bumpsEnd.x), T(4)], [X(m => m.b1.x + 5), C(25)], [X(m => m.gate.x), STOP.g0], [X(() => 1e9), C(25)]]), 'cliff']] },
];
// P에 gates도 넘기기
for (const sp of STAGE_POLICIES) {
  const wrap = f => (s, m, z, gates) => f(s, m, z, gates);
  for (const k in sp.good) sp.good[k] = wrap(sp.good[k]);
  sp.bad = sp.bad.map(([n, f, e]) => [n, wrap(f), e]);
}
module.exports = { STAGE_POLICIES, clamp };
