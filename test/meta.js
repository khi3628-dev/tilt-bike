// 2.0 규칙 단위 시험: node test/meta.js
const M = require('../src/meta.js'); let bad = 0;
const ok = (c, msg) => { console.log((c ? '  ✓ ' : '  ✗ ') + msg); if (!c) bad++; };
let s = M.normalize(null);
ok(s.coins === 0 && s.eq.frame === 'steel' && s.eq.gear === 'mid', '새 저장: 코인 0, 기본 부품');
const st0 = M.stats(s); ok(Object.values(st0).every(v => v === 1), '기본 부품 = 성능 배수 모두 1');
// 출석
let r = M.claimDaily(s, 100); ok(r.day === 1 && s.coins === 50, '1일째 50코인');
ok(M.claimDaily(s, 100) === null, '같은 날 두 번 못 받음');
r = M.claimDaily(s, 101); ok(r.day === 2 && s.coins === 120, '다음 날 2일째 70');
r = M.claimDaily(s, 103); ok(r.day === 3, '하루 빠져도 연속 (3일째)');
r = M.claimDaily(s, 106); ok(r.day === 1, '이틀 빠지면 1일째부터');
s = M.normalize(null); for (let d = 0; d < 6; d++) M.claimDaily(s, 200 + d);
r = M.claimDaily(s, 206); ok(r.day === 7 && M.owns(s, 'paint', 'gold') && M.owns(s, 'helmet', 'gold'), '7일째 금색 차체·헬멧');
const c0 = s.coins; for (let d = 7; d < 13; d++) M.claimDaily(s, 200 + d); r = M.claimDaily(s, 213);
ok(r.day === 7 && r.coins === 300 && s.coins === c0 + 50 + 70 + 90 + 110 + 130 + 160 + 300, '두 번째 7일째는 300코인');
// 구매·장착
s = M.normalize({ coins: 650 });
ok(!M.buy(s, 'paint', 'gold'), '출석 전용 아이템은 못 삼');
ok(M.buy(s, 'frame', 'carbon') && s.coins === 150 && s.eq.frame === 'carbon', '카본 500코인에 사고 장착');
ok(!M.buy(s, 'wheels', 'deep'), '코인 부족하면 못 삼');
ok(M.equip(s, 'frame', 'steel') && !M.equip(s, 'wheels', 'deep'), '가진 것만 장착');
// 장단점: 모든 부품에 좋아지는 것과 나빠지는 것이 같이 있음
const better = { drag: v => v < 1, rr: v => v < 1, rough: v => v < 1, slip: v => v < 1, jump: v => v > 1, air: v => v > 1, brake: v => v > 1, gust: v => v < 1 };
let tradeOk = true; for (const slot of M.PART_SLOTS) for (const it of M.ITEMS[slot]) { const ks = Object.keys(it.m); if (!ks.length) continue; const up = ks.some(k => better[k](it.m[k])), down = ks.some(k => !better[k](it.m[k])); if (!up || !down) { tradeOk = false; console.log('    장단점 없음:', slot, it.id); } }
ok(tradeOk, '모든 유료 부품에 장점과 단점이 같이 있음');
const fast = M.stats(s, { frame: 'carbon', wheels: 'deep', bars: 'drop', gear: 'heavy' }); ok(fast.drag > 0.8, '가장 빠른 조합도 공기저항 0.8 넘음 (최고 속도 +12% 이내): ' + fast.drag.toFixed(3));
// 옛 저장(v1) 불러와도 깨지지 않음
const old = M.normalize({ coins: 9, own: { bike: ['city', 'road'], frame: ['blue', 'red'] }, eq: { bike: 'road', frame: 'red' } });
ok(old.eq.frame === 'steel' && old.eq.paint === 'blue' && old.coins === 9, '옛 저장(v1)은 기본 부품으로 정리');
// 판 보상
s = M.normalize(null);
r = M.finishReward(s, '1-1', { ok: true, coinsPicked: 12, stars: 2, prevStars: 0, done: [false, true] });
ok(r.total === 12 + 5 + 20 + 30 + 25, '첫 완주: 코인12+완주5+첫클리어20+별2×15+미션25 = ' + r.total);
r = M.finishReward(s, '1-1', { ok: true, coinsPicked: 15, stars: 3, prevStars: 2, done: [true, true] });
ok(r.total === 15 + 5 + 15 + 25, '다시: 코인15+완주5+새 별15+새 미션25 = ' + r.total);
r = M.finishReward(s, '1-1', { ok: false, coinsPicked: 7 });
ok(r.total === 7, '실패해도 주운 코인은 받음');
// 데미지·수리
s = M.normalize({ coins: 100 });
M.addWear(s, 'bad', 30); M.addWear(s, 'bad', 50); ok(Math.abs(M.wearOf(s) - (0.18 + 0.3)) < 1e-9, '나쁜 착지 데미지 누적 ' + M.wearOf(s).toFixed(2));
ok(M.repairCost(s) === 39 && M.repair(s) && s.coins === 61 && M.wearOf(s) === 0, '수리 39코인');
// 고스트
const g = [[1.234, -2.5, 0.12], [2, -2.6, -0.3]]; const back = M.unpackGhost(M.packGhost(g));
ok(back.length === 2 && Math.abs(back[0][0] - 1.23) < 1e-9 && back[1][2] === -0.3, '고스트 저장/복원');
console.log(bad ? '\n실패 ' + bad : '\n모두 통과'); process.exit(bad ? 1 : 0);
