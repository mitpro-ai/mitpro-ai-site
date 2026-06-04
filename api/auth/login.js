const {
  DEMO_PASSWORD,
  DEMO_USERS,
  ROLE_SET,
  demoLoginEnabled,
  normalizeEmail,
  publicUser,
  sendJson,
  setSession,
  supabaseRows,
} = require("../_lib/partner-data");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, error: "Method not allowed." });
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let data = {};
  try {
    data = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    data = {};
  }
  const email = normalizeEmail(data.email);
  const password = String(data.password || "");
  if (!email || !password) {
    return sendJson(res, 400, { ok: false, error: "Email and password are required." });
  }

  let user = null;
  if (DEMO_USERS[email] && demoLoginEnabled() && password === DEMO_PASSWORD) {
    user = DEMO_USERS[email];
  }

  if (!user) {
    const rows = await supabaseRows("users", `email=eq.${encodeURIComponent(email)}&select=email,full_name,role,status,license_key,last_login_at&limit=1`);
    const row = rows[0];
    const configuredPassword = process.env.MITPRO_WEB_PARTNER_PASSWORD || process.env.MITPRO_WEB_MASTER_PASSWORD || "";
    const role = String(row?.role || "USER").toUpperCase();
    const status = String(row?.status || "ACTIVE").toLowerCase();
    const masterLicenseFallback = role === "MASTER" && status === "active" && row?.license_key && password === String(row.license_key);
    if (row && ((configuredPassword && password === configuredPassword) || masterLicenseFallback)) {
      user = {
        email: row.email,
        name: row.full_name || row.email,
        role,
        license_key: row.license_key || "",
        license_status: row.status || "ACTIVE",
      };
    }
  }

  const role = String(user?.role || "").toUpperCase();
  if (!user || !ROLE_SET.has(role)) {
    return sendJson(res, 401, {
      ok: false,
      error: "This login is not assigned to partner access or the password is incorrect.",
    });
  }
  setSession(res, user);
  return sendJson(res, 200, {
    ok: true,
    authenticated: true,
    user: publicUser(user),
  });
};
