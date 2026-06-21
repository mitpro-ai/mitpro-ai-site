const crypto = require("crypto");
const { sendJson } = require("./_lib/partner-data");

function cloudConfig() {
  const url = String(process.env.MITPRO_SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.MITPRO_SUPABASE_SERVICE_KEY || process.env.MITPRO_SUPABASE_ANON_KEY || "";
  return { url, key, enabled: Boolean(url && key) };
}

function clientIp(req) {
  return String(
    req.headers["x-forwarded-for"] ||
      req.headers["x-vercel-forwarded-for"] ||
      req.headers["cf-connecting-ip"] ||
      req.headers["x-real-ip"] ||
      req.socket?.remoteAddress ||
      "",
  )
    .split(",")[0]
    .trim()
    .slice(0, 80);
}

function hashValue(value) {
  const salt = process.env.MITPRO_WEB_SESSION_SECRET || process.env.MITPRO_SUPABASE_SERVICE_KEY || "mitpro-visitor";
  return crypto.createHmac("sha256", salt).update(String(value || "")).digest("hex");
}

function clean(value, max = 180) {
  return String(value || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);
}

function countryFromHeaders(req) {
  return clean(
    req.headers["x-vercel-ip-country"] ||
    req.headers["cf-ipcountry"] ||
    req.headers["x-country"] ||
    req.headers["x-appengine-country"] ||
    req.headers["cloudfront-viewer-country"] ||
    req.headers["x-geo-country"] ||
    "",
    40,
  );
}

module.exports = async function visitHandler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed." });

  const cfg = cloudConfig();
  if (!cfg.enabled) return sendJson(res, 200, { ok: true, stored: false, reason: "cloud_not_configured" });

  let body = {};
  try {
    if (Buffer.isBuffer(req.body)) body = JSON.parse(req.body.toString("utf8") || "{}");
    else body = typeof req.body === "object" && req.body ? req.body : JSON.parse(req.body || "{}");
  } catch {
    body = {};
  }

  const ip = clientIp(req);
  const visitorId = clean(body.visitor_id || "", 96) || hashValue(`${ip}:${req.headers["user-agent"] || ""}`).slice(0, 32);
  const sessionId = clean(body.session_id || visitorId, 96);
  const now = new Date().toISOString();
  const country = countryFromHeaders(req);
  const city = clean(req.headers["x-vercel-ip-city"] || "", 80);
  const region = clean(req.headers["x-vercel-ip-country-region"] || "", 80);

  const row = {
    user_id: "website_visitor",
    session_id: `web_${sessionId}`,
    device_id: `web_${visitorId}`,
    event_type: "WEBSITE_VISIT",
    event_time: now,
    ip_address: ip,
    country,
    app_version: "MITPRO_WEBSITE",
    metadata_json: {
      page: clean(body.page || req.headers.referer || "/", 240),
      title: clean(body.title || "", 140),
      referrer: clean(body.referrer || "", 240),
      timezone: clean(body.timezone || "", 80),
      language: clean(body.language || "", 40),
      screen: clean(body.screen || "", 40),
      city,
      region,
      country_source: country ? "edge_header" : "",
      visitor_hash: hashValue(visitorId).slice(0, 24),
      user_agent: clean(req.headers["user-agent"] || "", 220),
    },
  };

  try {
    const response = await fetch(`${cfg.url}/rest/v1/user_activity_logs`, {
      method: "POST",
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });
    if (!response.ok) return sendJson(res, 200, { ok: true, stored: false, status: response.status });
    return sendJson(res, 200, { ok: true, stored: true });
  } catch (error) {
    return sendJson(res, 200, { ok: true, stored: false, error: error.message });
  }
};
