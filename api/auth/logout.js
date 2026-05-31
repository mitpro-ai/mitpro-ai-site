const { clearSession, sendJson } = require("../_lib/partner-data");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, error: "Method not allowed." });
  }
  clearSession(res);
  return sendJson(res, 200, { ok: true, authenticated: false });
};
