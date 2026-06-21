const { sendJson } = require("./_lib/partner-data");

function cloudConfig() {
  const url = String(process.env.MITPRO_SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.MITPRO_SUPABASE_SERVICE_KEY || process.env.MITPRO_SUPABASE_ANON_KEY || "";
  return { url, key, enabled: Boolean(url && key) };
}

function clean(value, max = 220) {
  return String(value || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);
}

function clientIp(req) {
  return clean(
    String(
      req.headers["x-forwarded-for"] ||
      req.headers["x-vercel-forwarded-for"] ||
      req.headers["cf-connecting-ip"] ||
      req.headers["x-real-ip"] ||
      req.socket?.remoteAddress ||
      "",
    )
      .split(",")[0]
      .trim(),
    80,
  );
}

function countryFromHeaders(req) {
  return clean(
    req.headers["x-vercel-ip-country"] ||
      req.headers["cf-ipcountry"] ||
      req.headers["x-country"] ||
      req.headers["x-appengine-country"] ||
      "",
    40,
  );
}

function parseBody(req) {
  try {
    if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString("utf8") || "{}");
    if (typeof req.body === "object" && req.body) return req.body;
    return JSON.parse(req.body || "{}");
  } catch {
    return {};
  }
}

module.exports = async function mobileActivityHandler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed." });

  const cfg = cloudConfig();
  if (!cfg.enabled) return sendJson(res, 200, { ok: true, stored: false, reason: "cloud_not_configured" });

  const body = parseBody(req);
  const metadata = body.metadata_json && typeof body.metadata_json === "object" ? body.metadata_json : {};
  const now = new Date().toISOString();
  const ip = clientIp(req);
  const country = countryFromHeaders(req);

  const row = {
    user_id: clean(body.user_id || body.email || "mobile_user", 180).toLowerCase(),
    session_id: clean(body.session_id || `mobile_${Date.now()}`, 120),
    device_id: clean(body.device_id || "mobile_device", 180),
    event_type: clean(body.event_type || "MOBILE_HEARTBEAT", 80).toUpperCase(),
    event_time: clean(body.event_time || now, 80),
    ip_address: ip,
    country,
    app_version: clean(body.app_version || "LIVE_BUILD", 80),
    metadata_json: {
      ...metadata,
      client_kind: clean(metadata.client_kind || "ANDROID_MOBILE", 80),
      server_evidence_capture: true,
      server_ip_captured: Boolean(ip),
      server_country_captured: Boolean(country),
      server_country_code: country,
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
    return sendJson(res, 200, { ok: true, stored: true, country_captured: Boolean(country), ip_captured: Boolean(ip) });
  } catch (error) {
    return sendJson(res, 200, { ok: true, stored: false, error: error.message });
  }
};
