const {
  canManageLicenses,
  cloudConfig,
  getSessionUser,
  isMaster,
  normalizeEmail,
  sendJson,
} = require("../../_lib/partner-data");

function nowIso() {
  return new Date().toISOString();
}

function query(params) {
  return new URLSearchParams(params).toString();
}

function normalizeStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (["active", "suspended", "blocked"].includes(status)) return status;
  return "";
}

function normalizePlan(value) {
  const plan = String(value || "").trim().toUpperCase();
  if (["TRIAL", "BASIC", "PRO", "ELITE"].includes(plan)) return plan;
  return "";
}

function clampDays(value) {
  const days = Number.parseInt(value, 10);
  if (!Number.isFinite(days)) return 0;
  return Math.max(0, Math.min(3650, days));
}

async function supabaseRequest(method, tablePath, payload, queryString = "") {
  const cfg = cloudConfig();
  if (!cfg.enabled) throw new Error("Cloud license database is not connected.");
  const path = queryString ? `${tablePath}?${queryString}` : tablePath;
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
    throw new Error(data?.message || data?.error || "Cloud license action failed.");
  }
  return Array.isArray(data) ? data : [];
}

async function getLicense(licenseKey) {
  const rows = await supabaseRequest("GET", "user_licenses", null, query({
    license_key: `eq.${licenseKey}`,
    select: "*",
    limit: "1",
  }));
  return rows[0] || null;
}

async function writeEvent(user, licenseRow, payload) {
  try {
    await supabaseRequest("POST", "license_events", {
      event_type: payload.event_type,
      message: payload.message,
      email: normalizeEmail(licenseRow?.email),
      license_key: licenseRow?.license_key || "",
      status: payload.status || licenseRow?.status || "active",
      created_by: user.email || "",
      created_at: nowIso(),
      details_json: payload.details || {},
    });
  } catch {
    // Audit logging should not leave the license half-updated if the action succeeded.
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed." });
  const user = getSessionUser(req);
  if (!user || !canManageLicenses(user)) return sendJson(res, 403, { ok: false, error: "License support access required." });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const licenseKey = String(body.license_key || "").trim().toUpperCase();
    const reason = String(body.justification || body.reason || body.payment_note || "").trim().slice(0, 500);
    const requestedStatus = normalizeStatus(body.status);
    const requestedPlan = normalizePlan(body.plan_code);
    const extendDays = clampDays(body.extend_days);

    if (!licenseKey) return sendJson(res, 400, { ok: false, error: "License key is required." });
    if (!requestedStatus && !requestedPlan && !extendDays) return sendJson(res, 400, { ok: false, error: "Choose a license action first." });
    if (body.plan_code && !requestedPlan) return sendJson(res, 400, { ok: false, error: "Plan must be TRIAL, BASIC, PRO, or ELITE." });
    if (requestedPlan && !isMaster(user)) return sendJson(res, 403, { ok: false, error: "MASTER access required to upgrade or downgrade a license." });
    if (!reason) return sendJson(res, 400, { ok: false, error: "Justification is required for license changes." });

    const licenseRow = await getLicense(licenseKey);
    if (!licenseRow) return sendJson(res, 404, { ok: false, error: "License not found." });

    const now = nowIso();
    const patch = { updated_at: now };
    const details = { reason, previous_status: licenseRow.status || "", action_by: user.email || "" };

    if (requestedStatus) {
      patch.status = requestedStatus;
      details.new_status = requestedStatus;
    }

    if (requestedPlan) {
      patch.plan_code = requestedPlan;
      details.previous_plan = licenseRow.plan_code || "";
      details.new_plan = requestedPlan;
    }

    if (extendDays) {
      const currentExpiry = Date.parse(licenseRow.expiry_date || "");
      const base = Number.isFinite(currentExpiry) && currentExpiry > Date.now() ? currentExpiry : Date.now();
      patch.expiry_date = new Date(base + extendDays * 86400000).toISOString();
      patch.renewed_count = Number(licenseRow.renewed_count || 0) + 1;
      details.extend_days = extendDays;
      details.previous_expiry = licenseRow.expiry_date || "";
      details.new_expiry = patch.expiry_date;
      details.payment_confirmed = Boolean(body.payment_confirmed);
      details.payment_reference = String(body.payment_reference || "").trim().slice(0, 120);
    }

    const updatedRows = await supabaseRequest("PATCH", "user_licenses", patch, query({ license_key: `eq.${licenseKey}` }));

    if ((requestedStatus || requestedPlan) && licenseRow.email) {
      const userPatch = { updated_at: now };
      if (requestedStatus) userPatch.status = requestedStatus === "active" ? "active" : requestedStatus;
      if (requestedPlan) userPatch.plan_code = requestedPlan;
      await supabaseRequest("PATCH", "users", {
        ...userPatch,
      }, query({ email: `eq.${normalizeEmail(licenseRow.email)}` })).catch(() => []);
    }

    const actionType = extendDays
      ? "WEB_PARTNER_LICENSE_RENEW"
      : requestedPlan
        ? "WEB_PARTNER_LICENSE_PLAN"
        : "WEB_PARTNER_LICENSE_STATUS";
    await writeEvent(user, licenseRow, {
      event_type: actionType,
      message: extendDays
        ? `License ${licenseKey} renewed for ${extendDays} day(s)`
        : requestedPlan
          ? `License ${licenseKey} changed to ${requestedPlan}`
        : `License ${licenseKey} changed to ${requestedStatus}`,
      status: patch.status || licenseRow.status || "active",
      details,
    });

    return sendJson(res, 200, {
      ok: true,
      license_key: licenseKey,
      status: patch.status || licenseRow.status,
      plan_code: patch.plan_code || licenseRow.plan_code,
      expiry_date: patch.expiry_date || licenseRow.expiry_date,
      rows: updatedRows,
    });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message || "License action failed." });
  }
};
