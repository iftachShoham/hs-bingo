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
    for (const [name, image] of Object.entries(data)) {
      if (name && image) {
        map.set(name.toLowerCase().trim(), image);
      }
    }
    state.tileImages = map;
    console.log(`[tile-images] loaded ${map.size} entries`);
  } catch (err) {
    console.warn('[tile-images] error:', err);
    state.tileImages = new Map();
  }
}

// Retry a fetch up to `tries` times with exponential-ish backoff before giving up.
// Handles both network errors and non-ok HTTP responses (the transient 404 blip included).
async function fetchWithRetry(url, options = {}, { tries = 3, baseDelay = 400 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    if (attempt < tries) {
      const delay = baseDelay * attempt + Math.random() * 200;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
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
  const res = await fetchWithRetry(
    `${CONFIG.APPS_SCRIPT_URL}?view=boarddata&cb=${Date.now()}`,
    { redirect: "follow" }
  );
  return res.json();
}

// Activity log — public GET, returns all COMPLETE/EARLY_COMPLETE events in order
async function apiFetchActivityLog() {
  const res = await fetchWithRetry(
    `${CONFIG.APPS_SCRIPT_URL}?view=activitylog&cb=${Date.now()}`,
    { redirect: "follow" }
  );
  return res.json();
}
