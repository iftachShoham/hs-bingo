// ══════════════════════════════════════════════════════
//  High Society — Web Portal Proxy Worker
//
//  Deploy this as a NEW Cloudflare Worker (separate from
//  the existing Discord bot worker — don't touch that one).
//
//  Required environment variables (set in Worker settings):
//    GOOGLE_SCRIPT_URL  — your Apps Script web app URL
//    WEB_APP_SECRET     — same secret as in your Apps Script
//    DISCORD_BOT_TOKEN  — bot token for posting web actions to Discord channels
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
  async fetch(request, env, ctx) {

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

        // Post to the team's Discord channel when action came from the web app
        if (data.success && rest.source === "web" && env.DISCORD_BOT_TOKEN && rest.channel_id) {
          const posts = [];
          const msg = buildWebDiscordMessage(rest, data);
          if (msg) posts.push(discordPost(env, rest.channel_id, msg));
          // Rat victim notifications — send to the victim's channel too
          if (Array.isArray(data.extra_channel_messages)) {
            for (const item of data.extra_channel_messages) {
              if (item.channel_id && item.message) posts.push(discordPost(env, item.channel_id, item.message));
            }
          }
          // waitUntil keeps the worker alive until Discord posts complete
          if (posts.length) ctx.waitUntil(Promise.all(posts));
        }

        return respond(data);
      } catch (err) {
        return respond({ success: false, message: err.message }, 500);
      }
    }

    return respond({ success: false, message: "Method not allowed" }, 405);
  }
};

// Build the Discord message for web-initiated actions
function buildWebDiscordMessage(req, data) {
  const player = req.player_name ? ` (${req.player_name})` : "";

  // Complete: build clean message — avoids the "someone (someone)" format from Apps Script
  if (req.command === "complete" && data.result) {
    const r = data.result;
    const count = r.completion_count || 1;
    const required = r.amount_required || 1;
    const isPartial = count < required;
    let msg;
    if (isPartial) {
      const remaining = required - count;
      msg = `🔄 **${r.team_name}**${player} partially completed Tile ${r.tile}: *${r.tile_content || ""}* (${count}/${required} done, ${remaining} left)`;
    } else {
      const countLabel = required > 1 ? ` (${count}/${required})` : "";
      msg = `✅ **${r.team_name}**${player} completed Tile ${r.tile}: *${r.tile_content || ""}*${countLabel}`;
    }
    if (r.proof_url) msg += `\n🖼️ ${r.proof_url}`;
    return msg;
  }

  // Everything else: use the Apps Script message, append who triggered it from web
  if (!data.message) return null;
  const credit = req.player_name ? ` *(${req.player_name} via web)*` : " *(via web)*";
  return data.message + credit;
}

// Post a message to a Discord channel via bot token — returns the promise for ctx.waitUntil
function discordPost(env, channelId, content) {
  return fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bot ${env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ content })
  }).catch(() => {});
}
