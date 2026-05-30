// ══════════════════════════════════════════════════════
//  High Society — Web Portal Proxy Worker
//
//  Deploy this as a NEW Cloudflare Worker (separate from
//  the existing Discord bot worker — don't touch that one).
//
//  Required environment variables (set in Worker settings):
//    GOOGLE_SCRIPT_URL  — your Apps Script web app URL
//    WEB_APP_SECRET     — same secret as in your Apps Script
// ══════════════════════════════════════════════════════

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function respond(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS }
  });
}

export default {
  async fetch(request, env) {

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ── GET /?view=boardstate  →  proxy to Apps Script boarddata ──
    if (request.method === "GET") {
      const url    = new URL(request.url);
      const secret = url.searchParams.get("secret");

      if (secret !== env.WEB_APP_SECRET) {
        return respond({ success: false, message: "Unauthorized" }, 401);
      }

      try {
        const res  = await fetch(
          `${env.GOOGLE_SCRIPT_URL}?view=boarddata&cb=${Date.now()}`,
          { redirect: "follow" }
        );
        const data = await res.json();
        return respond({ success: true, ...data });
      } catch (err) {
        return respond({ success: false, message: err.message }, 500);
      }
    }

    // ── POST /  →  forward game commands to Apps Script ──
    if (request.method === "POST") {
      let body;
      try { body = await request.json(); }
      catch (_) { return respond({ success: false, message: "Invalid JSON" }, 400); }

      if (body.web_secret !== env.WEB_APP_SECRET) {
        return respond({ success: false, message: "Unauthorized" }, 401);
      }

      // Strip web_secret, add Apps Script secret, forward everything else
      const { web_secret: _dropped, ...rest } = body;
      const payload = { secret: env.WEB_APP_SECRET, ...rest };

      try {
        const res  = await fetch(env.GOOGLE_SCRIPT_URL, {
          method:   "POST",
          headers:  { "Content-Type": "text/plain;charset=utf-8" },
          body:     JSON.stringify(payload),
          redirect: "follow"
        });
        const data = await res.json();
        return respond(data);
      } catch (err) {
        return respond({ success: false, message: err.message }, 500);
      }
    }

    return respond({ success: false, message: "Method not allowed" }, 405);
  }
};
