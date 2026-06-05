const crypto = require("crypto");
const {
  getSessionUser,
  isMaster,
  sendJson,
} = require("../../_lib/partner-data");

function baseUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "www.mitpro.ai";
  return `${proto}://${host}`;
}

function secret() {
  return process.env.MITPRO_WEB_SESSION_SECRET || process.env.MITPRO_SUPABASE_SERVICE_KEY || "mitpro-oauth-state";
}

function sign(value) {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: "Method not allowed." });
  const user = getSessionUser(req);
  if (!user || !isMaster(user)) return sendJson(res, 403, { ok: false, error: "MASTER access required for Gmail authorization." });

  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.MITPRO_GOOGLE_CLIENT_ID || "";
  if (!clientId) return sendJson(res, 500, { ok: false, error: "GOOGLE_CLIENT_ID is not configured in Vercel." });

  const nonce = crypto.randomBytes(18).toString("base64url");
  const state = `${nonce}.${sign(nonce)}`;
  const redirectUri = `${baseUrl(req)}/api/admin/inbox/oauth_callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    state,
  });
  res.statusCode = 302;
  res.setHeader("Location", `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  res.end();
};
