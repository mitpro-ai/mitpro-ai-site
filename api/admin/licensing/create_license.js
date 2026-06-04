const crypto = require("crypto");
const {
  cloudConfig,
  getSessionUser,
  isMaster,
  normalizeEmail,
  sendJson,
} = require("../../_lib/partner-data");

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function nowIso() {
  return new Date().toISOString();
}

function plusDaysIso(days) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

function makeLicenseKey(planCode) {
  return `MITPRO-${planCode}-${crypto.randomBytes(3).toString("hex").toUpperCase()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

async function supabaseRequest(method, tablePath, payload, query = "") {
  const cfg = cloudConfig();
  if (!cfg.enabled) throw new Error("Cloud license database is not connected.");
  const path = query ? `${tablePath}?${query}` : tablePath;
  const res = await fetch(`${cfg.url}/rest/v1/${path}`, {
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
  const text = await res.text();
  const data = text ? JSON.parse(text) : [];
  if (!res.ok) {
    const message = data?.message || data?.error || "Cloud license update failed.";
    throw new Error(message);
  }
  return Array.isArray(data) ? data : [];
}

async function getRows(table, query) {
  return supabaseRequest("GET", table, null, query);
}

async function writeEvent(user, payload) {
  try {
    await supabaseRequest("POST", "license_events", {
      event_type: payload.event_type,
      message: payload.message,
      email: payload.email || "",
      license_key: payload.license_key || "",
      status: payload.status || "active",
      created_by: user.email || "",
      created_at: nowIso(),
      details_json: payload.details || {},
    });
  } catch {
    // Event logging should never block license creation.
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed." });
  const user = getSessionUser(req);
  if (!user || !isMaster(user)) return sendJson(res, 403, { ok: false, error: "MASTER access required to generate licenses." });

  try {
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const email = normalizeEmail(body.email);
  if (!email || !email.includes("@")) return sendJson(res, 400, { ok: false, error: "Customer email is required." });

  const phone = String(body.phone || "").trim().slice(0, 60);
  if (!phone) return sendJson(res, 400, { ok: false, error: "Phone / WhatsApp is required." });

  const planCode = String(body.plan_code || "PRO").trim().toUpperCase();
  if (!["TRIAL", "BASIC", "PRO", "ELITE"].includes(planCode)) {
    return sendJson(res, 400, { ok: false, error: "Plan must be TRIAL, BASIC, PRO, or ELITE." });
  }

  const validDays = clampInt(body.valid_days, 1, 3650, 30);
  const maxDevices = clampInt(body.max_devices, 1, 20, 1);
  const now = nowIso();
  const expiryDate = plusDaysIso(validDays);
  let licenseKey = String(body.license_key || "").trim().toUpperCase();
  if (!licenseKey) licenseKey = makeLicenseKey(planCode);

  const duplicate = await getRows("user_licenses", new URLSearchParams({
    license_key: `eq.${licenseKey}`,
    select: "license_key",
    limit: "1",
  }).toString());
  if (duplicate.length) {
    return sendJson(res, 409, { ok: false, error: "License key already exists. Leave key blank to auto-generate another." });
  }

  const existingLicense = await getRows("user_licenses", new URLSearchParams({
    email: `eq.${email}`,
    select: "license_key",
    limit: "1",
  }).toString());
  if (existingLicense.length) {
    return sendJson(res, 409, { ok: false, error: "Customer already has a license. Use renew/update license instead." });
  }

  const customerName = String(body.full_name || body.name || "").trim().slice(0, 120);
  const creatorEmail = normalizeEmail(user.email || "");
  const licenseNote = [
    String(body.justification || body.reason || "Created from Partner Portal").trim(),
    `Customer: ${customerName || email}`,
    `Phone: ${phone}`,
    `Created by: ${creatorEmail || "MASTER"}`,
    `Created at: ${now}`,
  ].filter(Boolean).join(" | ").slice(0, 500);

  const licensePayload = {
    user_id: null,
    email,
    license_key: licenseKey,
    plan_code: planCode,
    status: "active",
    start_date: now,
    expiry_date: expiryDate,
    max_devices: maxDevices,
    renewed_count: 0,
    notes: licenseNote,
    created_at: now,
    updated_at: now,
  };
  const rows = await supabaseRequest("POST", "user_licenses", licensePayload);

  await writeEvent(user, {
    event_type: "WEB_PARTNER_LICENSE_CREATE",
    message: `License ${licenseKey} created for ${email}`,
    email,
    license_key: licenseKey,
    status: "active",
    details: {
      plan_code: planCode,
      valid_days: validDays,
      max_devices: maxDevices,
      customer_name: customerName,
      phone,
      creator_email: creatorEmail,
      user_created: false,
      account_created_by_app_signup: true,
    },
  });

  return sendJson(res, 200, {
    ok: true,
    email,
    license_key: licenseKey,
    plan_code: planCode,
    expiry_date: expiryDate,
    user_created: false,
    account_created_by_app_signup: true,
    rows,
  });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { ok: false, error: error.message || "License creation failed." });
  }
};
