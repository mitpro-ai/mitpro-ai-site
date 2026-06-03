const { canManageLicenses, getSessionUser, sendJson } = require("../../_lib/partner-data");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed." });
  const user = getSessionUser(req);
  if (!user || !canManageLicenses(user)) return sendJson(res, 403, { ok: false, error: "License support access required." });
  return sendJson(res, 200, { ok: true, status: "queued", message: "Device reset accepted for cloud processing." });
};
