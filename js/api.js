// ══════════════════════════════════════════════════════
//  API — calls Apps Script directly
//  Content-Type: text/plain avoids CORS preflight (simple request)
// ══════════════════════════════════════════════════════

// ── Tile images — loaded once, matched by normalised task name ──
async function loadTileImages() {
  try {
    const res = await fetch('tile-images.json');
    if (!res.ok) {
      console.warn('[tile-images] fetch failed:', res.status, res.url);
      state.tileImages = new Map();
      return;
    }
    const data = await res.json();
    const map  = new Map();
    for (const entry of Object.values(data)) {
      if (entry.name && entry.image) {
        map.set(atob(entry.name).toLowerCase().trim(), entry.image);
      }
    }
    state.tileImages = map;
    console.log(`[tile-images] loaded ${map.size} entries`);
  } catch (err) {
    console.warn('[tile-images] error:', err);
    state.tileImages = new Map();
  }
}

// All team/admin commands
// Routes through proxy worker when PROXY_URL is configured (enables Discord posting).
// Falls back to calling Apps Script directly if proxy is unreachable or not deployed.
async function apiCommand(command, extra = {}) {
  const useProxy = CONFIG.PROXY_URL && !CONFIG.PROXY_URL.includes("%%");

  const makeBody = (authKey, url) => ({
    url,
    options: {
      method:   "POST",
      headers:  { "Content-Type": "text/plain;charset=utf-8" },
      body:     JSON.stringify({
        [authKey]:            CONFIG.WEB_SECRET,
        channel_id:           state.channelId,
        command,
        player_name:          state.playerName || "",
        player_password_hash: state.playerPasswordHash || "",
        source:               "web",
        ...extra
      }),
      redirect: "follow"
    }
  });

  if (useProxy) {
    try {
      const { url, options } = makeBody("web_secret", CONFIG.PROXY_URL);
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    } catch (proxyErr) {
      console.warn("Proxy failed, falling back to direct Apps Script:", proxyErr.message);
    }
  }

  // Direct Apps Script (fallback or no proxy configured)
  const { url, options } = makeBody("secret", CONFIG.APPS_SCRIPT_URL);
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Board state — public GET endpoint on Apps Script, no auth needed
async function apiFetchBoardState() {
  const res = await fetch(
    `${CONFIG.APPS_SCRIPT_URL}?view=boarddata&cb=${Date.now()}`,
    { redirect: "follow" }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
