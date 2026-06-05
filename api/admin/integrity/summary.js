const { getSessionUser, sendJson, supabaseRows } = require("../../_lib/partner-data");

function meta(row) {
  const value = row?.metadata_json || row?.metadata || {};
  return value && typeof value === "object" ? value : {};
}

function field(row, key) {
  const metadata = meta(row);
  return row?.[key] ?? metadata?.[key] ?? metadata?.lifecycle_row?.[key] ?? metadata?.integrity_context?.[key] ?? "";
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows || []) {
    const value = String(field(row, key) || "UNKNOWN").toUpperCase();
    out[value] = (out[value] || 0) + 1;
  }
  return Object.entries(out).map(([key, count]) => ({ key, count }));
}

function uniqueCount(rows, key) {
  const values = new Set();
  for (const row of rows || []) {
    const value = String(field(row, key) || "").trim().toLowerCase();
    if (value) values.add(value);
  }
  return values.size;
}

function isToday(value) {
  const time = Date.parse(value || "");
  if (!Number.isFinite(time)) return false;
  return new Date(time).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
}

function emailKey(value) {
  return String(value || "").trim().toLowerCase();
}

function countryFromUser(user) {
  const direct = String(user?.country || user?.country_name || user?.country_iso || user?.country_code || "").trim();
  if (direct) return direct;
  const rawNotes = String(user?.notes || "");
  if (!rawNotes) return "";
  try {
    const parsed = JSON.parse(rawNotes.replace(/^V2_SIGNUP_PROFILE\s+/i, ""));
    const profile = parsed?.v2_signup_profile || parsed;
    return String(profile?.country || profile?.country_iso || profile?.country_code || "").trim();
  } catch {
    const match = rawNotes.match(/"country"\s*:\s*"([^"]+)"/i);
    return String(match?.[1] || "").trim();
  }
}

function withProfileCountry(rows, userByEmail) {
  return (rows || []).map((row) => {
    if (field(row, "country")) return row;
    const email = emailKey(field(row, "user_id") || field(row, "email") || field(row, "user_email"));
    const profileCountry = countryFromUser(userByEmail.get(email));
    if (!profileCountry) return row;
    return {
      ...row,
      country: profileCountry,
      metadata_json: {
        ...meta(row),
        country_source: "user_profile_fallback",
      },
    };
  });
}

function profileActiveToday(rows) {
  return (rows || []).filter((row) => isToday(row?.last_login_at || row?.last_seen || row?.updated_at || row?.created_at));
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: "Method not allowed." });
  const user = getSessionUser(req);
  if (!user) return sendJson(res, 401, { ok: false, error: "Login required." });

  const [recentActivity, profileUsers, licenseProfiles] = await Promise.all([
    supabaseRows("user_activity_logs", "select=*&order=event_time.desc&limit=1000"),
    supabaseRows("users", "select=*&limit=1000"),
    supabaseRows("user_licenses", "select=*&limit=1000"),
  ]);
  const userByEmail = new Map((licenseProfiles || []).map((row) => [emailKey(row.email || row.user_email), row]));
  for (const row of profileUsers || []) userByEmail.set(emailKey(row.email || row.user_email), row);
  const lifecycle = recentActivity.filter((row) => String(row.event_type || "").toUpperCase() === "MARKET_LIFECYCLE");
  const heartbeats = recentActivity.filter((row) => String(row.event_type || "").toUpperCase() === "HEARTBEAT");
  const logins = recentActivity.filter((row) => String(row.event_type || "").toUpperCase() === "LOGIN");
  const backfilled = recentActivity.filter((row) => meta(row)._backfill);
  const activeToday = withProfileCountry(
    heartbeats.filter((row) => isToday(row.event_time || row.created_at)),
    userByEmail,
  );
  const enrichedRecentActivity = withProfileCountry(recentActivity, userByEmail);
  const activeCountryRows = countBy(activeToday, "country").filter((row) => row.key !== "UNKNOWN");
  const profileActiveCountries = countBy(profileActiveToday(profileUsers), "country").filter((row) => row.key !== "UNKNOWN");

  return sendJson(res, 200, {
    ok: true,
    summary: {
      overall_state: "Normal",
      records_reviewed: enrichedRecentActivity.length,
      lifecycle_records: lifecycle.length,
      heartbeat_records: heartbeats.length,
      login_records: logins.length,
      backfilled_records: backfilled.length,
      active_users_today: uniqueCount(activeToday, "user_id") || profileActiveToday(profileUsers).length,
      unique_users: uniqueCount(enrichedRecentActivity, "user_id"),
      unique_devices: uniqueCount(enrichedRecentActivity, "device_id"),
      unique_sessions: uniqueCount(enrichedRecentActivity, "session_id"),
      unique_ips: uniqueCount(enrichedRecentActivity, "ip_address"),
      unique_countries: uniqueCount(enrichedRecentActivity, "country"),
      unique_pairs: uniqueCount(lifecycle, "pair"),
      source_type: enrichedRecentActivity.length ? "supabase" : "cloud_ready",
      cloud_sync: { cloud_enabled: true, pending_cloud_events: 0 },
    },
    recent_activity: enrichedRecentActivity.slice(0, 250),
    lifecycle,
    heartbeats: heartbeats.slice(0, 250),
    logins: logins.slice(0, 100),
    results: countBy(lifecycle, "result_quality"),
    market_modes: countBy(lifecycle, "market_mode"),
    strategies: countBy(lifecycle, "strategy"),
    pair_session_matrix: countBy(lifecycle, "pair"),
    user_activity: countBy(enrichedRecentActivity, "event_type"),
    active_countries: activeCountryRows.length ? activeCountryRows : profileActiveCountries,
    pages: countBy(heartbeats, "page"),
    devices: countBy(recentActivity, "device_id"),
    risk_flags: [],
  });
};
