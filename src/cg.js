// CrazyGames HTML5 SDK v3 브리지 — SDK가 없거나 environment='disabled'면 전부 건너뜀
(function (root) {
  const S = { ready: false, on: false, sdk: null, env: 'none', muteCb: null };
  const sdk = () => (root.CrazyGames && root.CrazyGames.SDK) || null;
  const safe = (fn) => { try { return fn(); } catch (e) { return undefined; } };

  async function init() {
    const K = sdk();
    if (!K) { S.ready = true; return false; }
    try { await K.init(); } catch (e) { S.ready = true; return false; }
    S.ready = true;
    S.env = safe(() => K.environment) || 'unknown';
    if (S.env === 'disabled') return false;
    S.sdk = K; S.on = true;
    safe(() => K.game.settings && K.game.settings.addEventListener && K.game.settings.addEventListener('settingschange', (e) => {
      if (S.muteCb && e && e.data && 'muteAudio' in e.data) S.muteCb(!!e.data.muteAudio);
    }));
    safe(() => { const m = K.game.settings && K.game.settings.muteAudio; if (S.muteCb && m != null) S.muteCb(!!m); });
    return true;
  }
  const game = (name) => { if (S.on) safe(() => S.sdk.game[name]()); };

  // 중간 광고: 끝나든 실패하든 15초 안에 cb(true)
  function midgame(onStart, onEnd) {
    if (!S.on) { onEnd(false); return; }
    let done = false;
    const finish = (shown) => { if (done) return; done = true; clearTimeout(tm); onEnd(shown); };
    const tm = setTimeout(() => finish(false), 15000);
    try {
      S.sdk.ad.requestAd('midgame', {
        adStarted: () => { try { onStart(); } catch (e) { } },
        adFinished: () => finish(true),
        adError: () => finish(false)
      });
    } catch (e) { finish(false); }
  }
  async function dataGet(key) { if (!S.on) return null; try { const v = await S.sdk.data.getItem(key); return v == null ? null : v; } catch (e) { return null; } }
  function dataSet(key, val) { if (!S.on) return; safe(() => S.sdk.data.setItem(key, val)); }
  function happytime() { game('happytime'); }

  root.CG = {
    init, S,
    loadingStart: () => game('loadingStart'), loadingStop: () => game('loadingStop'),
    gameplayStart: () => game('gameplayStart'), gameplayStop: () => game('gameplayStop'),
    midgame, dataGet, dataSet, happytime,
    onMute(cb) { S.muteCb = cb; },
    active: () => S.on
  };
})(window);
