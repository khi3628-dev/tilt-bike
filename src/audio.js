// 소리: 전부 코드로 합성 (파일 없음)
(function (root) {
  let ctx = null, master = null, sfxGain = null, musGain = null;
  let rollSrc = null, rollGain = null, rollFilter = null, windSrc = null, windGain = null, windFilter = null;
  const st = { sound: true, music: true, muted: false, musicWorld: -1, musicOn: false };
  let noiseBuf = null, fallStop = null;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => { }); return true; }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC(); } catch (e) { return false; }
    master = ctx.createGain(); master.connect(ctx.destination);
    sfxGain = ctx.createGain(); sfxGain.connect(master);
    musGain = ctx.createGain(); musGain.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); let b = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; d[i] = b * 3.5; } // 갈색 노이즈
    // 바퀴 구름
    rollSrc = ctx.createBufferSource(); rollSrc.buffer = noiseBuf; rollSrc.loop = true;
    rollFilter = ctx.createBiquadFilter(); rollFilter.type = 'lowpass'; rollFilter.frequency.value = 300;
    rollGain = ctx.createGain(); rollGain.gain.value = 0;
    rollSrc.connect(rollFilter).connect(rollGain).connect(sfxGain); rollSrc.start();
    // 바람
    windSrc = ctx.createBufferSource(); windSrc.buffer = noiseBuf; windSrc.loop = true;
    windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 900; windFilter.Q.value = 0.6;
    windGain = ctx.createGain(); windGain.gain.value = 0;
    windSrc.connect(windFilter).connect(windGain).connect(sfxGain); windSrc.start();
    applyVolumes();
    return true;
  }
  function applyVolumes() {
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(st.muted ? 0 : 1, t, 0.02);
    sfxGain.gain.setTargetAtTime(st.sound ? 0.9 : 0, t, 0.02);
    musGain.gain.setTargetAtTime(st.music ? 0.32 : 0, t, 0.05);
  }
  function tone(freq, dur, type, vol, t0, slideTo) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(sfxGain); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function burst(dur, vol, t0, filterFreq, type) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = filterFreq || 800;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(sfxGain); s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
  }

  const SFX = {
    click() { if (!ensure()) return; tone(880, 0.06, 'square', 0.08, ctx.currentTime, 1200); },
    jump() { if (!ensure()) return; tone(300, 0.18, 'triangle', 0.18, ctx.currentTime, 700); },
    land(v) { if (!ensure()) return; const k = Math.min(1, v / 8); burst(0.12 + 0.1 * k, 0.5 + 0.6 * k, ctx.currentTime, 400); tone(90, 0.12, 'sine', 0.3 * k + 0.08, ctx.currentTime, 50); },
    crash() { if (!ensure()) return; const t = ctx.currentTime; burst(0.35, 1.2, t, 1200); tone(120, 0.3, 'sawtooth', 0.35, t, 40); tone(70, 0.5, 'sine', 0.4, t + 0.02, 30); },
    gate() { if (!ensure()) return; const t = ctx.currentTime; tone(523, 0.12, 'square', 0.12, t); tone(784, 0.18, 'square', 0.12, t + 0.1); },
    bridge() { if (!ensure()) return; const t = ctx.currentTime; for (let i = 0; i < 6; i++) burst(0.06, 0.6, t + i * 0.07, 2500, 'highpass'); tone(110, 0.4, 'sawtooth', 0.15, t + 0.1, 60); },
    finish() { if (!ensure()) return; const t = ctx.currentTime; [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.22, t + i * 0.09)); tone(1319, 0.5, 'triangle', 0.2, t + 0.4); },
    star(i) { if (!ensure()) return; tone(880 * Math.pow(1.25, i), 0.16, 'triangle', 0.2, ctx.currentTime); },
    fail() { if (!ensure()) return; const t = ctx.currentTime; tone(330, 0.25, 'square', 0.12, t, 250); tone(220, 0.4, 'square', 0.12, t + 0.22, 150); },
    grade(g) {   // [실험실] 착지 판정 소리
      if (!ensure()) return; const t = ctx.currentTime;
      if (g === 'perfect') { [784, 988, 1319].forEach((f, i) => tone(f, 0.16, 'triangle', 0.16, t + i * 0.05)); }
      else if (g === 'good') tone(660, 0.12, 'triangle', 0.1, t);
      else { burst(0.25, 0.9, t, 1500, 'bandpass'); tone(160, 0.2, 'sawtooth', 0.15, t, 70); }
    },
    whoosh() { if (!ensure()) return; burst(0.4, 0.4, ctx.currentTime, 1500, 'bandpass'); },
    fall() {   // 떨어지는 바람 소리 + 낮아지는 휘파람
      if (!ensure()) return; const t = ctx.currentTime;
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2400, t + 1.6);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1.6, t + 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      s.connect(f).connect(g).connect(sfxGain); s.start(t); s.stop(t + 3.3);
      tone(1200, 1.6, 'sine', 0.09, t + 0.05, 260);
      fallStop = () => { try { const n = ctx.currentTime; g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), n); g.gain.exponentialRampToValueAtTime(0.0001, n + 0.08); } catch (e) { } };
    },
    thud() {   // 바닥에 쿵
      if (!ensure()) return; const t = ctx.currentTime;
      if (fallStop) { fallStop(); fallStop = null; }
      burst(0.5, 2.2, t, 700); burst(0.9, 0.9, t + 0.05, 260);
      tone(95, 0.6, 'sine', 0.9, t, 32); tone(60, 0.9, 'sine', 0.7, t + 0.02, 24);
      for (let i = 0; i < 7; i++) burst(0.07, 0.5, t + 0.15 + Math.random() * 0.6, 1800, 'highpass');
    }
  };

  // 달리는 소리: 매 프레임
  function update(speed, grounded, windF, dt) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const roll = grounded > 0 ? Math.min(1, speed / 12) : 0;
    rollGain.gain.setTargetAtTime(roll * 0.5, t, 0.08);
    rollFilter.frequency.setTargetAtTime(200 + speed * 60, t, 0.1);
    const wind = Math.min(1, Math.max(0, (speed - 4) / 12)) * 0.35 + Math.min(1, Math.abs(windF || 0) / 5) * 0.4;
    windGain.gain.setTargetAtTime(wind, t, 0.15);
    windFilter.frequency.setTargetAtTime(500 + speed * 70 + Math.abs(windF || 0) * 120, t, 0.2);
  }
  function quiet() { if (!ctx) return; const t = ctx.currentTime; rollGain.gain.setTargetAtTime(0, t, 0.05); windGain.gain.setTargetAtTime(0, t, 0.05); if (labL) { labL.hissG.gain.setTargetAtTime(0, t, 0.05); labL.rainG.gain.setTargetAtTime(0, t, 0.2); } }

  // [실험실] 바닥 재질·비 소리 (실험실에서만 부름)
  let labL = null; const labAcc = { rock: 0, mud: 0, drip: 0 };
  function labLoops() {
    if (labL) return labL;
    const mk = (type, freq, q) => { const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = freq; if (q) fl.Q.value = q; const g = ctx.createGain(); g.gain.value = 0; src.connect(fl).connect(g).connect(sfxGain); src.start(0, Math.random()); return g; };
    labL = { hissG: mk('highpass', 3200), rainG: mk('bandpass', 2600, 0.4) };
    return labL;
  }
  function lab(surf, speed, grounded, rain, dt) {
    if (!ctx) return;
    const t = ctx.currentTime, Lp = labLoops();
    Lp.hissG.gain.setTargetAtTime(surf === 'ice' && grounded ? Math.min(2.2, speed * 0.16) : 0, t, 0.08);
    Lp.rainG.gain.setTargetAtTime(rain ? 1.6 * rain : 0, t, 0.3);
    if (surf === 'rock' && grounded && speed > 0.8) {      // 덜컹덜컹
      labAcc.rock += dt * (3 + speed * 1.6);
      while (labAcc.rock >= 1) { labAcc.rock -= 1; burst(0.05, 0.35 + Math.random() * 0.5 * Math.min(1, speed / 8), t + Math.random() * 0.03, 900 + Math.random() * 900, 'bandpass'); if (Math.random() < 0.3) tone(140 + Math.random() * 60, 0.06, 'square', 0.04, t); }
    } else labAcc.rock = 0;
    if (surf === 'mud' && grounded && speed > 0.8) {       // 철벅철벅
      labAcc.mud += dt * (1 + speed * 0.7);
      while (labAcc.mud >= 1) { labAcc.mud -= 1; const t0 = t + Math.random() * 0.05; burst(0.14, 0.7 * Math.min(1, speed / 6), t0, 420); tone(210 + Math.random() * 80, 0.12, 'sine', 0.1, t0, 80); }
    } else labAcc.mud = 0;
    if (rain) { labAcc.drip += dt * 5; while (labAcc.drip >= 1) { labAcc.drip -= 1; tone(1800 + Math.random() * 1600, 0.03, 'sine', 0.025, t + Math.random() * 0.2); } }
  }

  // ---------- 음악: 세계마다 다른 간단한 루프 ----------
  const SONGS = [
    { bpm: 112, bass: [0, 0, 5, 5, 7, 7, 5, 3], chords: [[0, 4, 7], [0, 4, 7], [5, 9, 12], [5, 9, 12], [7, 11, 14], [7, 11, 14], [5, 9, 12], [3, 7, 10]], lead: [12, 16, 19, 16, 14, 12, 14, 16, 17, 16, 14, 12, 11, 12, 14, 12], root: 48, wave: 'triangle' },
    { bpm: 126, bass: [0, 0, 3, 3, 5, 5, 3, 1], chords: [[0, 3, 7], [0, 3, 7], [3, 7, 10], [3, 7, 10], [5, 8, 12], [5, 8, 12], [3, 7, 10], [1, 5, 8]], lead: [12, 15, 19, 15, 12, 10, 12, 15, 17, 15, 12, 10, 8, 10, 12, 15], root: 45, wave: 'square' },
    { bpm: 138, bass: [0, 0, 7, 7, 5, 5, 3, 3], chords: [[0, 3, 7], [0, 3, 7], [7, 10, 14], [7, 10, 14], [5, 8, 12], [5, 8, 12], [3, 7, 10], [3, 7, 10]], lead: [12, 14, 15, 19, 17, 15, 14, 12, 10, 12, 14, 15, 14, 12, 10, 7], root: 43, wave: 'sawtooth' }
  ];
  let mus = { timer: null, next: 0, step: 0, song: null };
  const f = n => 440 * Math.pow(2, (n - 69) / 12);
  function schedule() {
    if (!mus.song || !st.musicOn) return;
    const S = mus.song, spb = 60 / S.bpm, stepLen = spb / 2; // 8분음표
    while (mus.next < ctx.currentTime + 0.3) {
      const t = mus.next, i = mus.step;
      const bar = Math.floor(i / 8) % 8, beat8 = i % 8;
      const chord = S.chords[bar];
      // 베이스 (4분음표마다)
      if (beat8 % 2 === 0) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = f(S.root + S.bass[bar]); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + spb * 0.9); o.connect(g).connect(musGain); o.start(t); o.stop(t + spb); }
      // 코드 (마디 첫 박, 길게)
      if (beat8 === 0) for (const n of chord) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = S.wave; o.frequency.value = f(S.root + 12 + n); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + spb * 3.8); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; o.connect(lp).connect(g).connect(musGain); o.start(t); o.stop(t + spb * 4); }
      // 멜로디 (8분음표, 2마디 패턴)
      const ln = S.lead[i % 16]; if (ln != null && (i % 16) % 3 !== 2) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = f(S.root + 24 + ln); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + stepLen * 0.9); o.connect(g).connect(musGain); o.start(t); o.stop(t + stepLen); }
      // 하이햇 (8분음표), 킥 (1·3박)
      { const s = ctx.createBufferSource(); s.buffer = noiseBuf; const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000; const g = ctx.createGain(); g.gain.setValueAtTime(beat8 % 2 ? 0.25 : 0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05); s.connect(hp).connect(g).connect(musGain); s.start(t, Math.random()); s.stop(t + 0.06); }
      if (beat8 === 0 || beat8 === 4) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12); g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15); o.connect(g).connect(musGain); o.start(t); o.stop(t + 0.16); }
      mus.next += stepLen; mus.step++;
    }
  }
  function music(world) {
    if (!ensure()) return;
    if (world == null || world < 0) { st.musicOn = false; clearInterval(mus.timer); mus.timer = null; mus.song = null; return; }
    if (st.musicOn && st.musicWorld === world) return;
    st.musicWorld = world; st.musicOn = true;
    mus.song = SONGS[world % SONGS.length]; mus.next = ctx.currentTime + 0.05; mus.step = 0;
    clearInterval(mus.timer); mus.timer = setInterval(schedule, 100); schedule();
  }

  const api = {
    ensure, update, quiet, music, SFX, lab,
    set(k, v) { st[k] = v; applyVolumes(); },
    get(k) { return st[k]; },
    setMuted(m) { st.muted = !!m; applyVolumes(); }
  };
  root.Audio2 = api;
})(window);
