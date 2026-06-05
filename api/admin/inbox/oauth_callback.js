const crypto = require("crypto");

function html(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
}

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

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
}

function page(title, content) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#070d12;color:#effafa;font-family:Segoe UI,Arial,sans-serif;padding:20px}.card{max-width:760px;border:1px solid rgba(102,255,244,.22);border-radius:18px;background:linear-gradient(180deg,rgba(12,31,34,.94),rgba(4,10,14,.98));padding:24px;box-shadow:0 28px 90px rgba(0,0,0,.44)}h1{margin:0 0 10px;text-transform:uppercase}p{color:#aec8c5;line-height:1.55}code,textarea{width:100%;box-sizing:border-box;border:1px solid rgba(18,255,145,.25);border-radius:10px;background:#061013;color:#12ff91;padding:12px;font-weight:800}textarea{min-height:90px;resize:vertical}.warn{color:#ffd36b;font-weight:800}.btn{display:inline-block;margin-top:14px;border:1px solid rgba(102,255,244,.3);border-radius:999px;padding:10px 14px;color:#effafa;text-decoration:none}</style></head><body><main class="card">${content}</main></body></html>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return html(res, 405, page("Method Not Allowed", "<h1>Method Not Allowed</h1>"));
  const url = new URL(req.url, baseUrl(req));
  const error = url.searchParams.get("error");
  if (error) return html(res, 400, page("Authorization Cancelled", `<h1>Authorization Cancelled</h1><p>${escapeHtml(error)}</p>`));

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  const [payload, mac] = state.split(".");
  const [nonce, inboxRaw] = String(payload || "").split(":");
  const inbox = inboxRaw === "admin" ? "admin" : "support";
  if (!code || !nonce || !mac || sign(payload) !== mac) {
    return html(res, 400, page("Invalid OAuth State", "<h1>Invalid OAuth State</h1><p>Please restart from the Founder Inbox authorization link inside the Master portal.</p>"));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.MITPRO_GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.MITPRO_GOOGLE_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) {
    return html(res, 500, page("Missing Credentials", "<h1>Missing Credentials</h1><p>GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured in Vercel before exchanging the code.</p>"));
  }

  const redirectUri = `${baseUrl(req)}/api/admin/inbox/oauth_callback`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return html(res, 400, page("Token Exchange Failed", `<h1>Token Exchange Failed</h1><p>${escapeHtml(data.error_description || data.error || "Google did not return a token.")}</p>`));
  }
  const refreshToken = data.refresh_token || "";
  if (!refreshToken) {
    return html(res, 200, page("Already Authorized", "<h1>Already Authorized</h1><p>Google did not return a new refresh token. Remove the app permission from your Google Account and run authorization again, or keep the existing refresh token if already saved.</p>"));
  }
  const variableName = inbox === "admin" ? "GOOGLE_ADMIN_REFRESH_TOKEN" : "GOOGLE_SUPPORT_REFRESH_TOKEN";
  return html(res, 200, page("Gmail Authorization Ready", `<h1>Gmail Authorization Ready</h1><p>Add this value in Vercel as <b>${escapeHtml(variableName)}</b>. Keep it private.</p><textarea readonly>${escapeHtml(refreshToken)}</textarea><p class="warn">After saving the variable, redeploy the site and refresh the Master dashboard.</p><a class="btn" href="/partner">Return to Partner Portal</a>`));
};
