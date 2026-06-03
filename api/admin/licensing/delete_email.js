const crypto = require("crypto");
const {
  cloudConfig,
  getSessionUser,
  isMaster,
  normalizeEmail,
  sendJson,
} = require("../../_lib/partner-data");

function nowIso() {
  return new Date().toISOString();
}

function hashEmail(email) {
  return crypto.createHash("sha256").update(email).digest("hex").slice(0, 16);
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
    const message = data?.message || data?.error || "Cloud delete failed.";
    throw new Error(message);
  }
  return Array.isArray(data) ? data : [];
}

function query(params) {
  return new URLSearchParams(params).toString();
}

async function rows(table, params) {
  return supabaseRequest("GET", table, null, query(params));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed." });
  const user = getSessionUser(req);
  if (!user || !isMaster(user)) return sendJson(res, 403, { ok: false, error: "MASTER access required to delete email records." });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const email = normalizeEmail(body.email);
    const confirmation = normalizeEmail(body.confirm_email);
    const reason = String(body.justification || body.reason || "").trim().slice(0, 500);

    if (!email || !email.includes("@")) return sendJson(res, 400, { ok: false, error: "Valid customer email is required." });
    if (email !== confirmation) return sendJson(res, 400, { ok: false, error: "Confirmation email must match exactly." });
    if (!reason) return sendJson(res, 400, { ok: false, error: "Master deletion reason is required." });
    if (email === normalizeEmail(user.email) || email.endsWith("@mitpro.local")) {
      return sendJson(res, 403, { ok: false, error: "Protected admin/demo emails cannot be deleted from this action." });
    }

    const [userRows, licenseRows, deviceRows] = await Promise.all([
      rows("users", { email: `eq.${email}`, select: "*" }),
      rows("user_licenses", { email: `eq.${email}`, select: "*" }),
      rows("user_devices", { email: `eq.${email}`, select: "*" }),
    ]);

    const licenseKeys = licenseRows.map((row) => String(row.license_key || "")).filter(Boolean);
    const redacted = `deleted:${hashEmail(email)}`;
    const auditDetails = {
      action: "WEB_PARTNER_DELETE_EMAIL",
      redacted_email: redacted,
      reason,
      deleted_counts: {
        users: userRows.length,
        licenses: licenseRows.length,
        devices: deviceRows.length,
      },
      license_keys: licenseKeys,
    };

    await supabaseRequest("POST", "license_events", {
      event_type: "WEB_PARTNER_DELETE_EMAIL",
      message: `Master deleted customer email record ${redacted}`,
      email: "",
      license_key: "",
      status: "deleted",
      created_by: user.email || "",
      created_at: nowIso(),
      details_json: auditDetails,
    }).catch(() => []);

    await supabaseRequest("PATCH", "license_events", {
      email: "",
      status: "deleted",
      message: `Customer email reference redacted by Master: ${redacted}`,
      details_json: auditDetails,
    }, query({ email: `eq.${email}` })).catch(() => []);

    await Promise.all([
      supabaseRequest("DELETE", "user_devices", null, query({ email: `eq.${email}` })).catch(() => []),
      supabaseRequest("DELETE", "user_licenses", null, query({ email: `eq.${email}` })).catch(() => []),
      supabaseRequest("DELETE", "users", null, query({ email: `eq.${email}` })).catch(() => []),
    ]);

    return sendJson(res, 200, {
      ok: true,
      deleted_email: email,
      redacted_email: redacted,
      deleted_counts: {
        users: userRows.length,
        licenses: licenseRows.length,
        devices: deviceRows.length,
      },
    });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message || "Email deletion failed." });
  }
};
