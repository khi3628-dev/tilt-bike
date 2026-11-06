// Fixie Drop 2.0 — 코인·차고·출석·미션·고스트·데미지 규칙과 저장 (화면과 분리, Node에서도 시험 가능)
(function (root) {
  // ---------- 차고 아이템 (price -1 = 출석 7일째 보상으로만) ----------
  // 부품: m = 성능 배수 (1 = 기본). 모든 부품은 장점과 단점이 같이 있음 (별 기준 시간은 기본 부품으로 잼)
  // drag 공기저항(↓ 빠름) · rr 구름저항 · rough 돌길·진흙 저항 · slip 얼음 미끄럼 · jump 점프 · air 공중 회전 · brake 젖혀 멈추는 힘 · gust 바람 영향
  const ITEMS = {
    frame: [
      { id: 'steel', price: 0, m: {}, name: { ko: '스틸', en: 'Steel' }, desc: { ko: '튼튼하고 무난함', en: 'Tough and balanced' } },
      { id: 'alu', price: 300, m: { jump: 1.15, air: 1.2, rough: 1.15, gust: 1.15 }, name: { ko: '알루미늄', en: 'Aluminium' }, desc: { ko: '가벼워서 점프·공중 회전↑, 돌길에 튀고 바람에 밀림', en: 'Light: better jumps and spins, bouncy on rocks, pushed by wind' } },
      { id: 'carbon', price: 500, m: { drag: 0.94, rough: 1.3, gust: 1.1 }, name: { ko: '카본', en: 'Carbon' }, desc: { ko: '빠름, 돌길·진흙에 약함', en: 'Fast, weak on rocks and mud' } }
    ],
    wheels: [
      { id: 'std', price: 0, m: {}, name: { ko: '기본 바퀴', en: 'Standard' }, desc: { ko: '무난함', en: 'Balanced' } },
      { id: 'deep', price: 300, m: { drag: 0.95, gust: 1.4, jump: 0.95 }, name: { ko: '딥림', en: 'Deep rims' }, desc: { ko: '빠름, 바람에 크게 흔들림', en: 'Fast, but wind hits hard' } },
      { id: 'fat', price: 300, m: { rough: 0.55, slip: 0.6, rr: 1.25, drag: 1.04 }, name: { ko: '두꺼운 타이어', en: 'Fat tyres' }, desc: { ko: '돌길·진흙·얼음에 강함, 평지에서 느림', en: 'Grips rocks, mud and ice, slower on smooth roads' } }
    ],
    bars: [
      { id: 'riser', price: 0, m: {}, name: { ko: '라이저', en: 'Riser' }, desc: { ko: '편하게 세운 핸들', en: 'Upright and easy' } },
      { id: 'bull', price: 200, m: { drag: 0.97, air: 0.9 }, name: { ko: '불혼', en: 'Bullhorn' }, desc: { ko: '조금 빠름, 공중 회전 조금↓', en: 'A bit faster, slightly slower air spins' } },
      { id: 'drop', price: 350, m: { drag: 0.95, air: 0.75, brake: 0.9 }, name: { ko: '드롭', en: 'Drop' }, desc: { ko: '빠름, 공중 회전·멈추기↓', en: 'Fast, weaker air spins and stops' } }
    ],
    gear: [
      { id: 'mid', price: 0, m: {}, name: { ko: '보통 기어', en: 'Medium gear' }, desc: { ko: '무난함', en: 'Balanced' } },
      { id: 'light', price: 200, m: { brake: 1.35, drag: 1.06 }, name: { ko: '가벼운 기어', en: 'Light gear' }, desc: { ko: '페달로 잘 버텨 잘 멈춤, 최고 속도↓', en: 'Easy skid stops, lower top speed' } },
      { id: 'heavy', price: 300, m: { drag: 0.95, brake: 0.7 }, name: { ko: '무거운 기어', en: 'Heavy gear' }, desc: { ko: '최고 속도↑, 잘 안 멈춤', en: 'Higher top speed, hard to stop' } }
    ],
    paint: [
      { id: 'blue', c: '#2b6cb0', price: 0 }, { id: 'red', c: '#d63c2f', price: 100 }, { id: 'green', c: '#2f9e57', price: 100 },
      { id: 'black', c: '#2a2a2e', price: 150 }, { id: 'pink', c: '#e5649b', price: 150 }, { id: 'white', c: '#e9edf1', price: 150 }, { id: 'gold', c: '#d4a017', price: -1 }
    ],
    shirt: [
      { id: 'orange', c: '#e8553d', price: 0 }, { id: 'blue', c: '#3b7dd8', price: 80 }, { id: 'green', c: '#3aa35a', price: 80 },
      { id: 'black', c: '#34343a', price: 120 }, { id: 'white', c: '#eeeeee', price: 120 }
    ],
    helmet: [
      { id: 'yellow', c: '#ffd23f', price: 0 }, { id: 'white', c: '#ffffff', price: 60 }, { id: 'red', c: '#e03b2f', price: 60 },
      { id: 'black', c: '#26262b', price: 100 }, { id: 'gold', c: '#d4a017', price: -1 }
    ]
  };
  const PART_SLOTS = ['frame', 'wheels', 'bars', 'gear'], COLOR_SLOTS = ['paint', 'shirt', 'helmet'];
  const find = (slot, id) => ITEMS[slot].find(it => it.id === id) || ITEMS[slot][0];

  // ---------- 보상 ----------
  const REWARD = { finish: 5, firstClear: 20, star: 15, mission: 25 };
  const DAILY = [50, 70, 90, 110, 130, 160];   // 1~6일째 코인, 7일째 금색 차체+헬멧 (이미 있으면 300코인)
  const DAILY7_COINS = 300;
  // 데미지: 나쁜 착지 1번에 0.12~0.3, 괜찮은 착지 0.02. 수리비 = 망가진 정도 × 80 코인 (최대 80)
  const WEAR_BAD = (rel) => Math.min(0.3, 0.12 + Math.max(0, rel - 20) * 0.006), WEAR_GOOD = 0.02, REPAIR_PER = 80;

  function fresh() {
    return { v: 2, coins: 0, own: { frame: ['steel'], wheels: ['std'], bars: ['riser'], gear: ['mid'], paint: ['blue'], shirt: ['orange'], helmet: ['yellow'] },
      eq: { frame: 'steel', wheels: 'std', bars: 'riser', gear: 'mid', paint: 'blue', shirt: 'orange', helmet: 'yellow' },
      missions: {}, cleared: {}, daily: { last: null, streak: 0 }, wear: {}, ghost: true };
  }
  function normalize(s) {
    const f = fresh(); s = Object.assign(f, s || {});
    for (const k of ['own', 'eq', 'daily']) s[k] = Object.assign(fresh()[k], s[k] || {});
    for (const slot of Object.keys(ITEMS)) { if (!Array.isArray(s.own[slot])) s.own[slot] = [ITEMS[slot][0].id]; if (!ITEMS[slot].some(it => it.id === s.eq[slot])) s.eq[slot] = ITEMS[slot][0].id; }
    s.missions = s.missions || {}; s.cleared = s.cleared || {}; s.wear = s.wear || {};
    return s;
  }
  // 날짜 번호 (기기 로컬 날짜, 자정 기준)
  const dayNum = (d) => { d = d || new Date(); return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000); };

  const api = {
    ITEMS, PART_SLOTS, COLOR_SLOTS, REWARD, DAILY, DAILY7_COINS, find, fresh, normalize, dayNum,
    skin(s) { return { frame: find('paint', s.eq.paint).c, shirt: find('shirt', s.eq.shirt).c, helmet: find('helmet', s.eq.helmet).c, frameP: s.eq.frame, wheels: s.eq.wheels, bars: s.eq.bars, gear: s.eq.gear }; },
    // 지금 조립한 부품의 성능 (배수끼리 곱함)
    stats(s, eq) {
      eq = eq || s.eq; const st = { drag: 1, rr: 1, rough: 1, slip: 1, jump: 1, air: 1, brake: 1, gust: 1 };
      for (const slot of PART_SLOTS) { const m = find(slot, eq[slot]).m || {}; for (const k in m) st[k] *= m[k]; }
      return st;
    },
    // 차고 막대용 1~5 점수
    ratings(st) {
      const c = v => Math.max(1, Math.min(5, Math.round(v * 2) / 2));
      return { speed: c(3 + (1 / st.drag - 1) * 12), rough: c(3 + (1 - st.rough) * 4), ice: c(3 + (1 - st.slip) * 4), air: c(3 + ((st.jump + st.air) / 2 - 1) * 8), brake: c(3 + (st.brake - 1) * 5), wind: c(3 + (1 - st.gust) * 5) };
    },
    owns(s, slot, id) { return s.own[slot].includes(id); },
    buy(s, slot, id) {
      const it = find(slot, id);
      if (it.price < 0 || api.owns(s, slot, id) || s.coins < it.price) return false;
      s.coins -= it.price; s.own[slot].push(id); s.eq[slot] = id; return true;
    },
    equip(s, slot, id) { if (!api.owns(s, slot, id)) return false; s.eq[slot] = id; return true; },
    // 출석: 하루 빠져도 연속 유지, 이틀 이상 빠지면 1일째부터
    dailyState(s, today) {
      today = today == null ? dayNum() : today;
      const d = s.daily, gap = d.last == null ? null : today - d.last;
      if (gap === 0) return { canClaim: false, streak: d.streak, day: ((d.streak - 1) % 7) + 1 };
      const streak = gap != null && gap <= 2 ? d.streak + 1 : 1;
      return { canClaim: true, streak, day: ((streak - 1) % 7) + 1 };
    },
    claimDaily(s, today) {
      today = today == null ? dayNum() : today;
      const st = api.dailyState(s, today); if (!st.canClaim) return null;
      s.daily = { last: today, streak: st.streak };
      if (st.day < 7) { s.coins += DAILY[st.day - 1]; return { day: st.day, coins: DAILY[st.day - 1] }; }
      const got = [];
      for (const slot of ['paint', 'helmet']) if (!api.owns(s, slot, 'gold')) { s.own[slot].push('gold'); got.push(slot); }
      if (got.length) return { day: 7, items: got };
      s.coins += DAILY7_COINS; return { day: 7, coins: DAILY7_COINS };
    },
    // 판 끝 보상 계산 (stars: 이번 별, prevStars: 전에 받은 별, done: 이번에 깬 미션 [bool,bool])
    finishReward(s, id, { ok, coinsPicked, stars, prevStars, done }) {
      const lines = []; let total = 0;
      const add = (k, n) => { if (n > 0) { lines.push([k, n]); total += n; } };
      add('coinsPicked', coinsPicked || 0);
      if (ok) {
        add('finish', REWARD.finish);
        if (!s.cleared[id]) { s.cleared[id] = true; add('firstClear', REWARD.firstClear); }
        add('stars', Math.max(0, stars - (prevStars || 0)) * REWARD.star);
        const prev = s.missions[id] || [false, false], now = prev.map((v, i) => v || !!(done && done[i]));
        add('missions', now.filter((v, i) => v && !prev[i]).length * REWARD.mission);
        s.missions[id] = now;
      }
      s.coins += total;
      return { total, lines };
    },
    // 데미지 (조립한 자전거 하나에 쌓임, 0~1)
    wearOf(s) { return s.wear.bike || 0; },
    addWear(s, grade, rel) {
      const b = 'bike', w = grade === 'bad' ? WEAR_BAD(rel || 20) : grade === 'good' ? WEAR_GOOD : 0;
      if (w) s.wear[b] = Math.min(1, (s.wear[b] || 0) + w);
      return w;
    },
    repairCost(s) { return Math.ceil(api.wearOf(s) * REPAIR_PER); },
    repair(s) {
      const cost = api.repairCost(s);
      if (!cost || s.coins < cost) return false;
      s.coins -= cost; s.wear.bike = 0; return true;
    },
    // 고스트: [x,y,각도] 줄을 1/15초 간격으로 담은 문자열
    packGhost(arr) { return arr.map(p => p.map(v => Math.round(v * 100)).join(',')).join(';'); },
    unpackGhost(str) { if (!str) return null; return str.split(';').map(t => t.split(',').map(v => +v / 100)); },
    GHOST_DT: 1 / 15
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Meta = api;
})(typeof window !== 'undefined' ? window : globalThis);
