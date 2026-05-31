function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { ok: false, error: "Method not allowed." });
  }
  return sendJson(res, 200, {
    ok: true,
    authenticated: false,
    user: null,
    cloud_license_ready: false,
    reason: "WEB_PARTNER_AUTH_PENDING",
  });
};
