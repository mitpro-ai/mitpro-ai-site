const { cloudConfig, getSessionUser, sendJson } = require("../_lib/partner-data");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { ok: false, error: "Method not allowed." });
  }
  const user = getSessionUser(req);
  return sendJson(res, 200, {
    ok: true,
    authenticated: Boolean(user),
    user,
    cloud_license_ready: cloudConfig().enabled,
  });
};
