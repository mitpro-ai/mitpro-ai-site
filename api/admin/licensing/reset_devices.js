const {
  canManageLicenses,
  cloudConfig,
  getSessionUser,
  normalizeEmail,
  sendJson,
} = require("../../_lib/partner-data");

function nowIso() {
  return new Date().toISOString();
}

function query(params) {
  return new URLSearchParams(params).toString();
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
    throw new Error(data?.message || data?.error || "Cloud device reset failed.");
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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed." });
  const user = getSessionUser(req);
  if (!user || !canManageLicenses(user)) return sendJson(res, 403, { ok: false, error: "License support access required." });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const licenseKey = String(body.license_key || "").trim().toUpperCase();
    const reason = String(body.justification || body.reason || "").trim().slice(0, 500);
    const deviceIdentifier = String(body.device_identifier || body.device_id || body.device_hash || body.id || "").trim();
    if (!licenseKey) return sendJson(res, 400, { ok: false, error: "License key is required." });
    if (!reason) return sendJson(res, 400, { ok: false, error: "Justification is required for device reset." });

    const licenseRow = await getLicense(licenseKey);
    if (!licenseRow) return sendJson(res, 404, { ok: false, error: "License not found." });

    const existingDevices = await supabaseRequest("GET", "user_devices", null, query({
      license_id: `eq.${licenseRow.id}`,
      select: "*",
    })).catch(() => []);

    let removedDevices = existingDevices;
    let resetMode = "all_devices";
    if (deviceIdentifier) {
      const target = existingDevices.find((device) => {
        return [device.id, device.device_id, device.device_hash].some((value) => String(value || "").trim() === deviceIdentifier);
      });
      if (!target) return sendJson(res, 404, { ok: false, error: "Selected device was not found for this license." });
      const deleteColumn = target.id ? "id" : target.device_id ? "device_id" : "device_hash";
      const deleteValue = target[deleteColumn];
      await supabaseRequest("DELETE", "user_devices", null, query({
        license_id: `eq.${licenseRow.id}`,
        [deleteColumn]: `eq.${deleteValue}`,
      }));
      removedDevices = [target];
      resetMode = "single_device";
    } else {
      await supabaseRequest("DELETE", "user_devices", null, query({ license_id: `eq.${licenseRow.id}` }));
    }
    await supabaseRequest("PATCH", "user_licenses", {
      updated_at: nowIso(),
      notes: `${resetMode === "single_device" ? "DEVICE_RESET_ONE" : "DEVICE_RESET"} ${reason}`,
    }, query({ license_key: `eq.${licenseKey}` })).catch(() => []);

    await supabaseRequest("POST", "license_events", {
      event_type: resetMode === "single_device" ? "WEB_PARTNER_DEVICE_RESET_ONE" : "WEB_PARTNER_DEVICE_RESET",
      message: resetMode === "single_device" ? `One device binding reset for ${licenseKey}` : `Device bindings reset for ${licenseKey}`,
      email: normalizeEmail(licenseRow.email),
      license_key: licenseKey,
      status: "device_reset",
      created_by: user.email || "",
      created_at: nowIso(),
      details_json: {
        reason,
        action_by: user.email || "",
        reset_mode: resetMode,
        removed_devices: removedDevices.length,
        removed_device: removedDevices[0] || null,
      },
    }).catch(() => []);

    return sendJson(res, 200, {
      ok: true,
      status: "completed",
      license_key: licenseKey,
      reset_mode: resetMode,
      removed_devices: removedDevices.length,
      message: resetMode === "single_device"
        ? "Selected device reset completed. That device can bind again on next login."
        : "Device reset completed. The customer can bind the next approved device on login.",
    });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message || "Device reset failed." });
  }
};
