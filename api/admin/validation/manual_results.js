const {
  canManageLicenses,
  cloudConfig,
  getSessionUser,
  normalizeEmail,
  sendJson,
  supabaseRows,
} = require("../../_lib/partner-data");

function clean(value, max = 240) {
  return String(value || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);
}

function query(params) {
  return new URLSearchParams(params).toString();
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
    ).split(",")[0],
    80,
  );
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

function parseBody(req) {
  try {
    if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString("utf8") || "{}");
    if (typeof req.body === "object" && req.body) return req.body;
    return JSON.parse(req.body || "{}");
  } catch {
    return {};
  }
}

async function supabaseRequest(method, tablePath, payload, queryString = "") {
  const cfg = cloudConfig();
  if (!cfg.enabled) throw new Error("Cloud database is not connected.");
  const path = queryString ? `${tablePath}?${queryString}` : tablePath;
  const response = await fetch(`${cfg.url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : [];
  if (!response.ok) throw new Error(data?.message || data?.error || "Manual validation save failed.");
  return Array.isArray(data) ? data : [];
}

function publicItem(row) {
  const meta = row?.metadata_json && typeof row.metadata_json === "object" ? row.metadata_json : {};
  return {
    id: row.id || meta.id || "",
    pair: meta.pair || "",
    strategy: meta.strategy || "",
    direction: meta.direction || "",
    session: meta.session || "",
    market_mode: meta.market_mode || "",
    open_price: meta.open_price || "",
    close_price: meta.close_price || "",
    result: meta.result || "",
    notes: meta.notes || "",
    created_by: meta.created_by || row.user_id || "",
    created_at: row.event_time || row.created_at || "",
  };
}

module.exports = async function handler(req, res) {
  const user = getSessionUser(req);
  if (!user || !canManageLicenses(user)) {
    return sendJson(res, 403, { ok: false, error: "License support access required." });
  }

  if (req.method === "GET") {
    const rows = await supabaseRows("user_activity_logs", query({
      select: "*",
      event_type: "eq.MANUAL_VALIDATION_RESULT",
      order: "event_time.desc",
      limit: "300",
    }));
    return sendJson(res, 200, { ok: true, items: rows.map(publicItem) });
  }

  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed." });

  try {
    const body = parseBody(req);
    const pair = clean(body.pair, 60).toUpperCase();
    const strategy = clean(body.strategy, 220);
    const direction = clean(body.direction, 30).toUpperCase();
    const session = clean(body.session, 60).toUpperCase();
    const marketMode = clean(body.market_mode, 30).toUpperCase();
    const result = clean(body.result, 30).toUpperCase();
    const openPrice = clean(body.open_price, 40);
    const closePrice = clean(body.close_price, 40);
    const notes = clean(body.notes, 500);

    if (!pair) return sendJson(res, 400, { ok: false, error: "Pair is required." });
    if (!openPrice || !closePrice) return sendJson(res, 400, { ok: false, error: "Open and close prices are required." });
    if (!["WORKED", "WEAK", "REFUND", "REVIEW"].includes(result)) {
      return sendJson(res, 400, { ok: false, error: "Choose a manual result." });
    }

    const now = new Date().toISOString();
    const payload = {
      user_id: normalizeEmail(user.email) || "manual_validation_admin",
      session_id: `manual_validation_${Date.now()}`,
      device_id: "partner_manual_validation",
      event_type: "MANUAL_VALIDATION_RESULT",
      event_time: now,
      ip_address: clientIp(req),
      country: countryFromHeaders(req),
      app_version: "MITPRO_PARTNER",
      metadata_json: {
        pair,
        strategy,
        direction,
        session,
        market_mode: marketMode,
        open_price: openPrice,
        close_price: closePrice,
        result,
        notes,
        created_by: normalizeEmail(user.email),
        source: "partner_manual_validation_recovery",
      },
    };

    const rows = await supabaseRequest("POST", "user_activity_logs", payload);
    return sendJson(res, 200, { ok: true, item: publicItem(rows[0] || payload), message: "Manual validation recovery saved." });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message || "Manual validation save failed." });
  }
};
