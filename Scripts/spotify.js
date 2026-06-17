document.addEventListener('DOMContentLoaded', function () {
  const clientId = '96c80947f534424785c248138a0c68cb';
  const scope = 'user-read-playback-state user-read-currently-playing user-modify-playback-state';
  const POLL_MS = 5000;

  const AUTH_REDIRECT = 'https://stytab-callback.vercel.app/callback.html';
  const runtime =
    (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime :
    (typeof chrome  !== 'undefined' && chrome.runtime)  ? chrome.runtime  : null;
  const extReturn = runtime && runtime.getURL ? runtime.getURL('callback.html') : AUTH_REDIRECT;

  const TOKEN_KEY    = 'spotify_access_token';
  const REFRESH_KEY  = 'spotify_refresh_token';
  const EXPIRY_KEY   = 'spotify_token_expiry';
  const VERIFIER_KEY = 'spotify_code_verifier';
  const STATE_KEY    = 'spotify_auth_state';
  const RESULT_KEY   = 'spotify_auth_result';

  const el = {
    widget:       document.getElementById('spotify-widget'),
    disconnected: document.getElementById('spotify-disconnected'),
    player:       document.getElementById('spotify-player'),
    connect:      document.getElementById('spotify-connect'),
    logout:       document.getElementById('spotify-logout'),
    toggle:       document.getElementById('toggle-spotify'),
    status:       document.getElementById('spotify-status'),
    title:        document.getElementById('spotify-title'),
    artist:       document.getElementById('spotify-artist'),
    albumArt:     document.getElementById('spotify-album-art'),
    playPause:    document.getElementById('spotify-play-pause'),
    prev:         document.getElementById('spotify-prev'),
    next:         document.getElementById('spotify-next'),
    progressBar:  document.getElementById('spotify-progress-bar'),
    timeCurrent:  document.getElementById('spotify-time-current'),
    timeTotal:    document.getElementById('spotify-time-total'),
  };

  if (!el.widget) return;

  function randomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    return Array.from(crypto.getRandomValues(new Uint8Array(length)),
      v => chars[v % chars.length]).join('');
  }

  function base64url(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function base64urlString(str) {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function pkceChallenge(verifier) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return base64url(digest);
  }

  const hasAuth = () => !!(localStorage.getItem(REFRESH_KEY) || localStorage.getItem(TOKEN_KEY));

  function storeTokens(data) {
    if (data.access_token)  localStorage.setItem(TOKEN_KEY, data.access_token);
    if (data.refresh_token) localStorage.setItem(REFRESH_KEY, data.refresh_token);
    if (data.expires_in)    localStorage.setItem(EXPIRY_KEY, Date.now() + data.expires_in * 1000);
  }

  async function getValidToken() {
    const token = localStorage.getItem(TOKEN_KEY);
    const expiry = Number(localStorage.getItem(EXPIRY_KEY) || 0);
    if (token && Date.now() < expiry - 10000) return token;

    const refresh = localStorage.getItem(REFRESH_KEY);
    if (!refresh) return token || null;

    try {
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refresh,
          client_id: clientId,
        }),
      });
      if (!res.ok) { disconnect(); return null; }
      const data = await res.json();
      storeTokens(data);
      return data.access_token;
    } catch (err) {
      console.error('Spotify: token refresh failed', err);
      return null;
    }
  }

  async function api(path, options = {}) {
    const token = await getValidToken();
    if (!token) return null;
    return fetch(`https://api.spotify.com/v1${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...options.headers },
    });
  }

  let isConnected = false;
  let hasTrack = false;

  function updateEmpty() {
    el.widget.classList.toggle('spotify-empty', isConnected && !hasTrack);
  }

  function setConnected(connected) {
    isConnected = connected;
    if (el.disconnected) el.disconnected.style.display = connected ? 'none' : 'flex';
    if (el.player)       el.player.style.display       = connected ? 'flex' : 'none';
    if (el.connect)      el.connect.style.display      = connected ? 'none' : 'inline-block';
    if (el.logout)       el.logout.style.display       = connected ? 'inline-block' : 'none';
    if (el.status)
      el.status.textContent = `Spotify account: ${connected ? 'Connected' : 'Disconnected'}`;
    updateEmpty();
  }

  function syncConnectEnabled() {
    if (el.connect) el.connect.disabled = !(el.toggle && el.toggle.checked);
  }

  function markNoPremium() {
    el.widget.classList.add('spotify-no-premium');
  }

  let track = { progressMs: 0, durationMs: 0, isPlaying: false, syncAt: 0 };

  function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  function renderProgress() {
    if (!el.progressBar) return;
    const { progressMs, durationMs, isPlaying, syncAt } = track;
    if (!durationMs) {
      el.progressBar.style.width = '0%';
      if (el.timeCurrent) el.timeCurrent.textContent = '0:00';
      if (el.timeTotal)   el.timeTotal.textContent = '0:00';
      return;
    }
    const current = Math.min(progressMs + (isPlaying ? Date.now() - syncAt : 0), durationMs);
    el.progressBar.style.width = `${(current / durationMs) * 100}%`;
    if (el.timeCurrent) el.timeCurrent.textContent = formatTime(current);
    if (el.timeTotal)   el.timeTotal.textContent = formatTime(durationMs);
  }

  function renderTrack(item, isPlaying, progressMs) {
    hasTrack = !!item;
    if (item) {
      el.title.textContent  = item.name;
      el.artist.textContent = item.artists.map(a => a.name).join(', ');
      const url = item.album.images[0] && item.album.images[0].url;
      if (url) { el.albumArt.src = url; el.albumArt.style.display = 'block'; }
      else     { el.albumArt.removeAttribute('src'); el.albumArt.style.display = 'none'; }
      el.playPause.classList.toggle('is-playing', !!isPlaying);
      track = { progressMs: progressMs || 0, durationMs: item.duration_ms || 0,
                isPlaying: !!isPlaying, syncAt: Date.now() };
    } else {
      el.title.textContent  = 'Nothing playing';
      el.artist.textContent = '—';
      el.albumArt.removeAttribute('src');
      el.albumArt.style.display = 'none';
      el.playPause.classList.remove('is-playing');
      track = { progressMs: 0, durationMs: 0, isPlaying: false, syncAt: 0 };
    }
    renderProgress();
    updateEmpty();
  }

  function disconnect() {
    [TOKEN_KEY, REFRESH_KEY, EXPIRY_KEY].forEach(k => localStorage.removeItem(k));
    renderTrack(null);
    setConnected(false);
  }

  async function fetchNowPlaying() {
    const res = await api('/me/player/currently-playing');
    if (!res) return;
    if (res.status === 401) return disconnect();
    if (res.status === 204) return renderTrack(null);
    if (!res.ok) return;
    const data = await res.json();
    renderTrack(data.item, data.is_playing, data.progress_ms);
  }

  async function control(method, path) {
    const res = await api(path, { method });
    if (!res) return;
    if (res.status === 401) return disconnect();
    if (res.status === 403) return markNoPremium();
    fetchNowPlaying();
  }

  async function togglePlay() {
    const res = await api('/me/player');
    if (!res) return;
    if (res.status === 401) return disconnect();
    if (res.status === 403) return markNoPremium();
    if (res.status !== 200) return;
    const playing = (await res.json()).is_playing;
    control('PUT', `/me/player/${playing ? 'pause' : 'play'}`);
  }

  async function login() {
    const verifier = randomString(64);
    const state = base64urlString(JSON.stringify({ nonce: randomString(16), ret: extReturn }));
    localStorage.setItem(VERIFIER_KEY, verifier);
    localStorage.setItem(STATE_KEY, state);
    localStorage.removeItem(RESULT_KEY);

    const authUrl = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: AUTH_REDIRECT,
      scope,
      code_challenge_method: 'S256',
      code_challenge: await pkceChallenge(verifier),
      state,
    });

    const popup = window.open(authUrl, 'Spotify Auth', 'width=500,height=600');

    let settled = false;
    const handle = async (data) => {
      if (settled || !data) return;
      const { code, state: returnedState, error } = data;
      if (!code && !error) return;

      settled = true;
      window.removeEventListener('message', onMessage);
      window.removeEventListener('storage', onStorage);
      localStorage.removeItem(RESULT_KEY);
      try { if (popup && !popup.closed) popup.close(); } catch (e) {}

      if (error) return console.error('Spotify: auth error', error);
      if (returnedState !== localStorage.getItem(STATE_KEY))
        return console.error('Spotify: auth state mismatch');

      await exchangeCode(code);
    };

    const onMessage = (event) => {
      if (event.origin !== location.origin) return;
      handle(event.data);
    };
    const onStorage = (event) => {
      if (event.key !== RESULT_KEY || !event.newValue) return;
      try { handle(JSON.parse(event.newValue)); } catch (e) {}
    };

    window.addEventListener('message', onMessage);
    window.addEventListener('storage', onStorage);
  }

  async function exchangeCode(code) {
    try {
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: AUTH_REDIRECT,
          client_id: clientId,
          code_verifier: localStorage.getItem(VERIFIER_KEY) || '',
        }),
      });
      if (!res.ok) return console.error('Spotify: token exchange failed', await res.text());

      storeTokens(await res.json());
      localStorage.removeItem(VERIFIER_KEY);
      localStorage.removeItem(STATE_KEY);
      setConnected(true);
      fetchNowPlaying();
    } catch (err) {
      console.error('Spotify: token exchange error', err);
    }
  }

  if (el.connect)   el.connect.addEventListener('click', login);
  if (el.logout)    el.logout.addEventListener('click', disconnect);
  if (el.toggle)    el.toggle.addEventListener('change', syncConnectEnabled);
  if (el.playPause) el.playPause.addEventListener('click', togglePlay);
  if (el.prev)      el.prev.addEventListener('click', () => control('POST', '/me/player/previous'));
  if (el.next)      el.next.addEventListener('click', () => control('POST', '/me/player/next'));

  const APPEARANCE = [
    { id: 'spotify-controls-hover',    key: 'spotify_controls_hover',    cls: 'controls-hover', def: true },
    { id: 'spotify-progress-hover',    key: 'spotify_progress_hover',    cls: 'progress-hover' },
    { id: 'spotify-hide-bg',           key: 'spotify_hide_bg',           cls: 'no-bg' },
    { id: 'spotify-disable-controls',  key: 'spotify_disable_controls',  cls: 'no-controls' },
  ];

  const LAYOUTS = ['compact', 'card', 'minimal'];
  const layoutSelect = document.getElementById('spotify-layout');

  function applyAppearance() {
    APPEARANCE.forEach(({ id, key, cls, def }) => {
      const stored = localStorage.getItem(key);
      const on = stored === null ? !!def : stored === 'true';
      el.widget.classList.toggle(cls, on);
      const input = document.getElementById(id);
      if (input) input.checked = on;
    });
    const layout = localStorage.getItem('spotify_layout') || 'compact';
    LAYOUTS.forEach(l => el.widget.classList.toggle(`spotify-layout-${l}`, l === layout));
    if (layoutSelect) layoutSelect.value = layout;
  }

  applyAppearance();

  const saveBtn = document.getElementById('save-settings');
  if (saveBtn) saveBtn.addEventListener('click', () => {
    APPEARANCE.forEach(({ id, key }) => {
      const input = document.getElementById(id);
      if (input) localStorage.setItem(key, input.checked);
    });
    if (layoutSelect) localStorage.setItem('spotify_layout', layoutSelect.value);
    applyAppearance();
  });

  setConnected(hasAuth());
  syncConnectEnabled();
  fetchNowPlaying();
  setInterval(fetchNowPlaying, POLL_MS);
  setInterval(renderProgress, 1000);
});
