function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, error: "Method not allowed." });
  }
  return sendJson(res, 503, {
    ok: false,
    error: "MIT PRO web partner login is being connected to cloud authentication. Please use the protected MIT PRO app login until cloud partner access is enabled.",
    reason: "WEB_PARTNER_AUTH_PENDING",
  });
};
