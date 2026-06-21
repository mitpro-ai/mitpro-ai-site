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

function planName(planCode) {
  return ({ BASIC: "GUARDIAN", PRO: "COMMANDER", ELITE: "SUPREME" }[String(planCode || "").toUpperCase()] || String(planCode || "GUARDIAN").toUpperCase());
}

function normalizeProductScope(value) {
  const scope = String(value || "").trim().toUpperCase().replace(/[\s:-]+/g, "_");
  if (["DESKTOP", "MOBILE", "DESKTOP_MOBILE"].includes(scope)) return scope;
  if (["BUNDLE", "DESKTOP_PLUS_MOBILE", "DESKTOP_AND_MOBILE"].includes(scope)) return "DESKTOP_MOBILE";
  return "";
}

function productScopeLabel(scope) {
  return ({
    DESKTOP: "Desktop",
    MOBILE: "Mobile",
    DESKTOP_MOBILE: "Desktop + Mobile",
  }[normalizeProductScope(scope)] || "");
}

function productScopeFromNotes(notes) {
  const text = String(notes || "");
  const match = text.match(/Product scope:\s*([^|]+)/i);
  if (match) return normalizeProductScope(match[1]);
  const label = text.match(/Product access:\s*([^|]+)/i);
  if (label) return normalizeProductScope(label[1]);
  return "DESKTOP";
}

function normalizePlanSelection(value) {
  const raw = String(value || "").trim().toUpperCase().replace(/[\s:-]+/g, "_");
  const map = {
    TRIAL: { planCode: "BASIC", licenseType: "TRIAL" },
    TRIAL_BASIC: { planCode: "BASIC", licenseType: "TRIAL" },
    TRIAL_GUARDIAN: { planCode: "BASIC", licenseType: "TRIAL" },
    TRIAL_PRO: { planCode: "PRO", licenseType: "TRIAL" },
    TRIAL_COMMANDER: { planCode: "PRO", licenseType: "TRIAL" },
    TRIAL_ELITE: { planCode: "ELITE", licenseType: "TRIAL" },
    TRIAL_SUPREME: { planCode: "ELITE", licenseType: "TRIAL" },
    BASIC: { planCode: "BASIC", licenseType: "PAID" },
    GUARDIAN: { planCode: "BASIC", licenseType: "PAID" },
    PRO: { planCode: "PRO", licenseType: "PAID" },
    COMMANDER: { planCode: "PRO", licenseType: "PAID" },
    ELITE: { planCode: "ELITE", licenseType: "PAID" },
    SUPREME: { planCode: "ELITE", licenseType: "PAID" },
  };
  return map[raw] || null;
}

function planSelectionLabel(selection) {
  if (!selection) return "";
  const category = planName(selection.planCode);
  return selection.licenseType === "TRIAL" ? `Trial ${category}` : category;
}

function licenseNoteForChange(existingNotes, selection, productScope, userEmail, reason, now) {
  const clean = String(existingNotes || "")
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part && !/^License type:/i.test(part) && !/^Trial category:/i.test(part) && !/^Access category:/i.test(part) && !/^Product access:/i.test(part) && !/^Product scope:/i.test(part));
  if (selection) {
    clean.push(`License type: ${selection.licenseType}`);
    clean.push(selection.licenseType === "TRIAL" ? `Trial category: ${planName(selection.planCode)}` : `Access category: ${planName(selection.planCode)}`);
  }
  if (productScope) {
    clean.push(`Product access: ${productScopeLabel(productScope)}`);
    clean.push(`Product scope: ${productScope}`);
  }
  clean.push(`Updated by: ${userEmail || "MASTER"}`);
  clean.push(`Updated at: ${now}`);
  if (reason) clean.push(`Update reason: ${reason}`);
  return clean.join(" | ").slice(0, 500);
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
    const requestedPlan = body.plan_code ? normalizePlanSelection(body.plan_code) : null;
    const requestedProductScope = normalizeProductScope(body.product_scope || body.product_access || body.scope);
    const extendDays = clampDays(body.extend_days);

    if (!licenseKey) return sendJson(res, 400, { ok: false, error: "License key is required." });
    if (!requestedStatus && !requestedPlan && !requestedProductScope && !extendDays) return sendJson(res, 400, { ok: false, error: "Choose a license action first." });
    if (body.plan_code && !requestedPlan) return sendJson(res, 400, { ok: false, error: "Plan must be Trial Guardian, Trial Commander, Trial Supreme, Guardian, Commander, or Supreme." });
    if ((requestedPlan || requestedProductScope) && !isMaster(user)) return sendJson(res, 403, { ok: false, error: "MASTER access required to upgrade or downgrade a license." });
    if (!reason) return sendJson(res, 400, { ok: false, error: "Justification is required for license changes." });

    const licenseRow = await getLicense(licenseKey);
    if (!licenseRow) return sendJson(res, 404, { ok: false, error: "License not found." });

    const now = nowIso();
    const patch = { updated_at: now };
    const details = { reason, previous_status: licenseRow.status || "", action_by: user.email || "" };
    const previousProductScope = productScopeFromNotes(licenseRow.notes);

    if (requestedStatus) {
      patch.status = requestedStatus;
      details.new_status = requestedStatus;
    }

    if (requestedPlan || requestedProductScope) {
      const nextPlan = requestedPlan || {
        planCode: String(licenseRow.plan_code || "PRO").toUpperCase(),
        licenseType: String(licenseRow.notes || "").toUpperCase().includes("LICENSE TYPE: TRIAL") ? "TRIAL" : "PAID",
      };
      const nextProductScope = requestedProductScope || previousProductScope || "DESKTOP";
      patch.plan_code = nextPlan.planCode;
      patch.notes = licenseNoteForChange(licenseRow.notes, nextPlan, nextProductScope, user.email || "", reason, now);
      details.previous_plan = licenseRow.plan_code || "";
      details.new_plan = nextPlan.planCode;
      details.license_type = nextPlan.licenseType;
      details.access_category = planName(nextPlan.planCode);
      details.previous_product_scope = previousProductScope;
      details.new_product_scope = nextProductScope;
      details.product_access = productScopeLabel(nextProductScope);
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

    if ((requestedStatus || requestedPlan || requestedProductScope) && licenseRow.email) {
      const userPatch = { updated_at: now };
      if (requestedStatus) userPatch.status = requestedStatus === "active" ? "active" : requestedStatus;
      if (requestedPlan) userPatch.plan_code = requestedPlan.planCode;
      await supabaseRequest("PATCH", "users", {
        ...userPatch,
      }, query({ email: `eq.${normalizeEmail(licenseRow.email)}` })).catch(() => []);
    }

    const actionType = extendDays
      ? "WEB_PARTNER_LICENSE_RENEW"
      : requestedPlan || requestedProductScope
        ? "WEB_PARTNER_LICENSE_ACCESS"
        : "WEB_PARTNER_LICENSE_STATUS";
    await writeEvent(user, licenseRow, {
      event_type: actionType,
      message: extendDays
        ? `License ${licenseKey} renewed for ${extendDays} day(s)`
        : requestedPlan || requestedProductScope
          ? `License ${licenseKey} changed to ${productScopeLabel(requestedProductScope || productScopeFromNotes(patch.notes)) || productScopeLabel(productScopeFromNotes(patch.notes))} ${requestedPlan ? planSelectionLabel(requestedPlan) : planName(patch.plan_code || licenseRow.plan_code)}`
        : `License ${licenseKey} changed to ${requestedStatus}`,
      status: patch.status || licenseRow.status || "active",
      details,
    });

    return sendJson(res, 200, {
      ok: true,
      license_key: licenseKey,
      status: patch.status || licenseRow.status,
      plan_code: patch.plan_code || licenseRow.plan_code,
      license_type: requestedPlan?.licenseType,
      access_category: requestedPlan ? planName(requestedPlan.planCode) : undefined,
      product_scope: requestedProductScope || productScopeFromNotes(patch.notes || licenseRow.notes),
      product_access: productScopeLabel(requestedProductScope || productScopeFromNotes(patch.notes || licenseRow.notes)),
      expiry_date: patch.expiry_date || licenseRow.expiry_date,
      rows: updatedRows,
    });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message || "License action failed." });
  }
};
