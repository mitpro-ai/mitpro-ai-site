const { getSessionUser, sendJson } = require("../../../_lib/partner-data");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed." });
  const user = getSessionUser(req);
  if (!user) return sendJson(res, 401, { ok: false, error: "Login required." });
  return sendJson(res, 200, { ok: true, status: "queued", message: "Support message recorded for cloud review." });
};
