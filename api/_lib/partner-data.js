const crypto = require("crypto");

const SESSION_COOKIE = "mitpro_web_session";
const SESSION_MAX_AGE = 60 * 60 * 8;
const DEMO_PASSWORD = "MitPro@Test2026";

const DEMO_USERS = {
  "dummy.master@mitpro.local": {
    email: "dummy.master@mitpro.local",
    name: "Dummy Master",
    role: "MASTER",
    plan_code: "ELITE",
    license_key: "MITPRO-WEB-DUMMY-MASTER",
  },
  "dummy.salessupport@mitpro.local": {
    email: "dummy.salessupport@mitpro.local",
    name: "Dummy Sales Support Admin",
    role: "SALES_SUPPORT_ADMIN",
    plan_code: "BASIC",
    license_key: "MITPRO-BASIC-DUMMY-SALESSUPPORT",
  },
  "dummy.support@mitpro.local": {
    email: "dummy.support@mitpro.local",
    name: "Dummy License Support",
    role: "LICENSE_SUPPORT_ADMIN",
    plan_code: "BASIC",
    license_key: "MITPRO-BASIC-DUMMY-SUPPORT",
  },
  "dummy.sales@mitpro.local": {
    email: "dummy.sales@mitpro.local",
    name: "Dummy Sales Manager",
    role: "SALES_MANAGER",
    plan_code: "BASIC",
    license_key: "MITPRO-BASIC-DUMMY-SALES",
  },
  "dummy.salesagent@mitpro.local": {
    email: "dummy.salesagent@mitpro.local",
    name: "Dummy Sales Agent",
    role: "SALES_AGENT",
    plan_code: "BASIC",
    license_key: "MITPRO-BASIC-DUMMY-SALESAGENT",
  },
};

const ROLE_SET = new Set([
  "MASTER",
  "SALES_SUPPORT_ADMIN",
  "LICENSE_SUPPORT_ADMIN",
  "LICENSE_ADMIN",
  "SALES_MANAGER",
  "SALES_AGENT",
  "SUPPORT_AGENT",
]);

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function secret() {
  return process.env.MITPRO_WEB_SESSION_SECRET || process.env.MITPRO_SUPABASE_SERVICE_KEY || "mitpro-web-dev-session";
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(payload) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function parseCookies(req) {
  const raw = String(req.headers.cookie || "");
  const cookies = {};
  raw.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx > -1) cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return cookies;
}

function publicUser(user) {
  if (!user) return null;
  const role = String(user.role || user.user_role || "USER").toUpperCase();
  return {
    name: user.name || user.full_name || user.email || "MIT Pro User",
    email: normalizeEmail(user.email),
    role,
    user_role: role,
    license_status: user.license_status || user.status || "ACTIVE",
    license_mode: user.license_mode || user.plan_code || user.plan || "BASIC",
    license_key: user.license_key || "",
    plan: user.plan_code || user.plan || "BASIC",
    plan_code: user.plan_code || user.plan || "BASIC",
    features: user.features || {},
    feature_levels: user.feature_levels || {},
    expiry_date: user.expiry_date || "",
  };
}

function setSession(res, user) {
  const payload = base64url(JSON.stringify({
    email: normalizeEmail(user.email),
    name: user.name || user.full_name || "",
    role: String(user.role || "USER").toUpperCase(),
    plan_code: user.plan_code || user.plan || "BASIC",
    license_key: user.license_key || "",
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  }));
  const token = `${payload}.${sign(payload)}`;
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`);
}

function clearSession(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

function getSessionUser(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token || !token.includes(".")) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac || sign(payload) !== mac) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    const role = String(data.role || "USER").toUpperCase();
    if (!ROLE_SET.has(role)) return null;
    return publicUser(data);
  } catch {
    return null;
  }
}

function cloudConfig() {
  const url = String(process.env.MITPRO_SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.MITPRO_SUPABASE_SERVICE_KEY || process.env.MITPRO_SUPABASE_ANON_KEY || "";
  return { url, key, enabled: Boolean(url && key) };
}

async function supabaseRows(table, query = "") {
  const cfg = cloudConfig();
  if (!cfg.enabled) return [];
  const sep = query ? `?${query}` : "";
  const response = await fetch(`${cfg.url}/rest/v1/${table}${sep}`, {
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) return [];
  const data = await response.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

function isMaster(user) {
  return String(user?.role || "").toUpperCase() === "MASTER";
}

function canManageLicenses(user) {
  return ["MASTER", "SALES_SUPPORT_ADMIN", "LICENSE_SUPPORT_ADMIN", "LICENSE_ADMIN"].includes(String(user?.role || "").toUpperCase());
}

function planName(value) {
  return ({ BASIC: "GUARDIAN", PRO: "COMMANDER", ELITE: "SUPREME" }[String(value || "").toUpperCase()] || String(value || "GUARDIAN").toUpperCase());
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows || []) {
    const value = String(row?.[key] || "UNKNOWN").toUpperCase();
    out[value] = (out[value] || 0) + 1;
  }
  return Object.entries(out).map(([k, v]) => ({ key: k, count: v }));
}

function daysUntil(value) {
  const time = Date.parse(value || "");
  if (!Number.isFinite(time)) return null;
  return Math.ceil((time - Date.now()) / 86400000);
}

function visibleForUser(rows, user) {
  const role = String(user?.role || "").toUpperCase();
  const email = normalizeEmail(user?.email);
  if (role === "MASTER" || role === "SALES_SUPPORT_ADMIN" || role === "LICENSE_SUPPORT_ADMIN" || role === "LICENSE_ADMIN" || role === "SUPPORT_AGENT") {
    return rows || [];
  }
  return (rows || []).filter((row) => {
    const rowEmail = normalizeEmail(row.email || row.user_email);
    const owner = normalizeEmail(row.owner_email || row.employee_email || row.sales_email);
    return rowEmail === email || owner === email;
  });
}

module.exports = {
  DEMO_PASSWORD,
  DEMO_USERS,
  ROLE_SET,
  canManageLicenses,
  clearSession,
  cloudConfig,
  countBy,
  daysUntil,
  getSessionUser,
  isMaster,
  normalizeEmail,
  planName,
  publicUser,
  sendJson,
  setSession,
  supabaseRows,
  visibleForUser,
};
