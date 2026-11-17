'use strict';
/* Bones & Brine — CrazyGames SDK v3 bridge. Only the CrazyGames build includes this file
   (tools/build-crazygames.sh). The game talks to it through window.BNB_HOOKS; the SDK docs are at
   https://docs.crazygames.com/sdk/intro/ */
(function () {
  let sdk = null, ready = false, inGame = false, adMuted = false, settingsMuted = false;
  const applyMute = () => { window.BNB_MUTED = adMuted || settingsMuted; };

  function applySettings() {
    const st = (sdk && sdk.game && sdk.game.settings) || {};
    settingsMuted = !!st.muteAudio; applyMute();
    document.body.classList.toggle('no-chat', !!st.disableChat);
  }

  /** Midgame ad at a natural break (end of a game). The SDK enforces the ~3 minute cooldown itself. */
  function midgameAd() {
    if (!ready) return;
    sdk.ad.requestAd('midgame', {
      adStarted: () => { adMuted = true; applyMute(); },
      adFinished: () => { adMuted = false; applyMute(); },
      adError: () => { adMuted = false; applyMute(); }    // unfilled, cooldown, adblock… just carry on
    });
  }

  window.BNB_HOOKS = {
    screen(name) {
      if (!ready) return;
      const playing = name === 'game';
      if (playing && !inGame) sdk.game.gameplayStart();
      if (!playing && inGame) sdk.game.gameplayStop();
      inGame = playing;
      if (name !== 'lobby') sdk.game.hideInviteButton();
    },
    gameover(won) {
      if (!ready) return;
      if (won) sdk.game.happytime();
      setTimeout(midgameAd, 2500);                         // after the winner screen has shown
    },
    /** Lobby open for joiners → show CrazyGames' invite button; null → hide it. */
    lobby(code) {
      if (!ready) return;
      if (code) sdk.game.showInviteButton({ room: code }); else sdk.game.hideInviteButton();
    },
    inviteUrl(code) { return ready ? sdk.game.inviteLink({ room: code }) : null; }
  };

  async function init() {
    if (!window.CrazyGames || !window.CrazyGames.SDK) return;
    sdk = window.CrazyGames.SDK;
    try { await sdk.init(); } catch (e) { console.warn('CrazyGames SDK init failed', e); return; }
    if (sdk.environment === 'disabled') return;
    ready = true;
    sdk.game.loadingStart();
    applySettings();
    sdk.game.addSettingsChangeListener(applySettings);
    // loading ends when the 3D pirates are ready (or after 10 s, whichever comes first)
    let stopped = false;
    const stop = () => {
      if (stopped) return; stopped = true;
      sdk.game.loadingStop();
      const game = window.BonesAndBrine;
      const room = sdk.game.getInviteParam('room');
      if (game && room) game.joinRoom(room);                         // opened from a friend's invite
      else if (game && sdk.game.isInstantMultiplayer) game.quickGame();   // "play multiplayer now" from the portal
    };
    window.addEventListener('avatar3d-ready', stop, { once: true });
    if (window.Avatar3D && window.Avatar3D.ready) stop();
    setTimeout(stop, 10000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
