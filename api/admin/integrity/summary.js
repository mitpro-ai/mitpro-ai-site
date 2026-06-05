const { getSessionUser, sendJson, supabaseRows } = require("../../_lib/partner-data");

function meta(row) {
  const value = row?.metadata_json || row?.metadata || {};
  return value && typeof value === "object" ? value : {};
}

function field(row, key) {
  const metadata = meta(row);
  const value = row?.[key] ?? metadata?.[key] ?? metadata?.lifecycle_row?.[key] ?? metadata?.integrity_context?.[key] ?? "";
  return key === "country" ? normalizeCountry(value) : value;
}

function normalizeCountry(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const key = raw.toLowerCase().replace(/\s+/g, " ");
  const compact = key.replace(/[^a-z0-9+]/g, "");
  const map = {
    "+1": "USA",
    "1": "USA",
    us: "USA",
    usa: "USA",
    unitedstates: "USA",
    america: "USA",
    "+44": "UK",
    "44": "UK",
    uk: "UK",
    gb: "UK",
    unitedkingdom: "UK",
    greatbritain: "UK",
    "+91": "India",
    "91": "India",
    in: "India",
    india: "India",
    "+966": "Saudi Arabia",
    "966": "Saudi Arabia",
    sa: "Saudi Arabia",
    ksa: "Saudi Arabia",
    saudi: "Saudi Arabia",
    saudiarabia: "Saudi Arabia",
    "+971": "UAE",
    "971": "UAE",
    ae: "UAE",
    uae: "UAE",
    unitedarabemirates: "UAE",
  };
  return map[compact] || raw;
}

function countryFromTimezone(value) {
  const tz = String(value || "").trim().toLowerCase();
  const map = {
    "asia/riyadh": "Saudi Arabia",
    "asia/kolkata": "India",
    "asia/calcutta": "India",
    "asia/dubai": "UAE",
    "europe/london": "UK",
    "america/new_york": "USA",
    "america/chicago": "USA",
    "america/denver": "USA",
    "america/los_angeles": "USA",
  };
  if (map[tz]) return map[tz];
  if (tz.startsWith("america/")) return "USA";
  return "";
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows || []) {
    const value = String(field(row, key) || "UNKNOWN").toUpperCase();
    out[value] = (out[value] || 0) + 1;
  }
  return Object.entries(out).map(([key, count]) => ({ key, count }));
}

function countUniqueByCountry(rows) {
  const countryUsers = new Map();
  for (const row of rows || []) {
    const country = String(field(row, "country") || "").trim().toUpperCase();
    if (!country || country === "UNKNOWN") continue;
    const identity = emailKey(field(row, "user_id") || field(row, "email") || field(row, "user_email"))
      || String(field(row, "device_id") || field(row, "session_id") || "").trim().toLowerCase();
    if (!identity) continue;
    if (!countryUsers.has(country)) countryUsers.set(country, new Set());
    countryUsers.get(country).add(identity);
  }
  return Array.from(countryUsers.entries()).map(([key, users]) => ({ key, count: users.size }));
}

function activeUserRows(rows) {
  const latest = new Map();
  for (const row of rows || []) {
    if (!isToday(row?.event_time || row?.created_at)) continue;
    const metadata = meta(row);
    const email = emailKey(field(row, "user_id") || field(row, "email") || field(row, "user_email"));
    const device = String(field(row, "device_id") || "").trim();
    const session = String(field(row, "session_id") || "").trim();
    const identity = email || device || session;
    if (!identity) continue;

    const lastSeen = row?.event_time || row?.created_at || "";
    const current = latest.get(identity);
    const lastSeenTime = Date.parse(lastSeen || "");
    const currentTime = Date.parse(current?.last_seen || "");
    if (current && (!Number.isFinite(lastSeenTime) || lastSeenTime <= currentTime)) continue;

    latest.set(identity, {
      id: identity,
      user_id: email || "",
      email,
      device_id: device,
      session_id: session,
      country: field(row, "country") || "",
      last_seen: lastSeen,
      event_type: row?.event_type || metadata?.event_type || "activity",
      page: field(row, "page") || metadata?.page || "",
    });
  }
  return Array.from(latest.values())
    .sort((a, b) => Date.parse(b.last_seen || "") - Date.parse(a.last_seen || ""))
    .slice(0, 100);
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
  const direct = normalizeCountry(user?.country || user?.country_name || user?.country_iso || user?.country_code || user?.phone_country_code);
  if (direct) return direct;
  const tzCountry = countryFromTimezone(user?.timezone || user?.time_zone);
  if (tzCountry) return tzCountry;
  const rawNotes = String(user?.notes || "");
  if (!rawNotes) return "";
  try {
    const parsed = JSON.parse(rawNotes.replace(/^V2_SIGNUP_PROFILE\s+/i, ""));
    const profile = parsed?.v2_signup_profile || parsed;
    return normalizeCountry(profile?.country || profile?.country_iso || profile?.country_code || profile?.phone_country_code) || countryFromTimezone(profile?.timezone || profile?.time_zone);
  } catch {
    const match = rawNotes.match(/"country"\s*:\s*"([^"]+)"/i);
    return normalizeCountry(match?.[1]);
  }
}

function withProfileCountry(rows, userByEmail) {
  return (rows || []).map((row) => {
    if (field(row, "country")) return row;
    const metadataCountry = countryFromTimezone(meta(row).time_zone || meta(row).timeZone || meta(row).timezone);
    if (metadataCountry) {
      return {
        ...row,
        country: metadataCountry,
        metadata_json: {
          ...meta(row),
          country_source: "heartbeat_timezone",
        },
      };
    }
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

function profileActiveToday(rows, activityEmails = new Set()) {
  return (rows || []).filter((row) => {
    const email = emailKey(row?.email || row?.user_email);
    return (email && activityEmails.has(email)) || isToday(row?.last_login_at || row?.last_seen || row?.updated_at || row?.created_at);
  });
}

function rememberProfile(map, row) {
  const email = emailKey(row?.email || row?.user_email);
  if (!email) return;
  const existing = map.get(email);
  if (!existing || (!countryFromUser(existing) && countryFromUser(row))) {
    map.set(email, row);
  }
}

function countryRowsForActiveProfiles(profileRows, userByEmail, activityEmails = new Set()) {
  return profileActiveToday(profileRows, activityEmails).map((row) => {
    const email = emailKey(row?.email || row?.user_email);
    const best = userByEmail.get(email) || row;
    return {
      key: countryFromUser(best) || countryFromUser(row),
      count: 1,
    };
  }).filter((row) => row.key);
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
  const userByEmail = new Map();
  for (const row of licenseProfiles || []) rememberProfile(userByEmail, row);
  for (const row of profileUsers || []) rememberProfile(userByEmail, row);
  const lifecycle = recentActivity.filter((row) => String(row.event_type || "").toUpperCase() === "MARKET_LIFECYCLE");
  const heartbeats = recentActivity.filter((row) => String(row.event_type || "").toUpperCase() === "HEARTBEAT");
  const logins = recentActivity.filter((row) => String(row.event_type || "").toUpperCase() === "LOGIN");
  const backfilled = recentActivity.filter((row) => meta(row)._backfill);
  const activeToday = withProfileCountry(
    heartbeats.filter((row) => isToday(row.event_time || row.created_at)),
    userByEmail,
  );
  const enrichedRecentActivity = withProfileCountry(recentActivity, userByEmail);
  const activityEmailsToday = new Set(
    enrichedRecentActivity
      .filter((row) => isToday(row.event_time || row.created_at))
      .map((row) => emailKey(field(row, "user_id") || field(row, "email") || field(row, "user_email")))
      .filter(Boolean),
  );
  const activeCountryRows = countBy(activeToday, "country").filter((row) => row.key !== "UNKNOWN");
  const activityCountryRows = countUniqueByCountry(
    enrichedRecentActivity.filter((row) => isToday(row.event_time || row.created_at)),
  ).filter((row) => row.key !== "UNKNOWN");
  const activeUsers = activeUserRows(enrichedRecentActivity);
  const profileActiveCountries = countBy(countryRowsForActiveProfiles(profileUsers, userByEmail, activityEmailsToday), "key").filter((row) => row.key !== "UNKNOWN");
  const licenseActiveCountries = countBy(countryRowsForActiveProfiles(licenseProfiles, userByEmail, activityEmailsToday), "key").filter((row) => row.key !== "UNKNOWN");

  return sendJson(res, 200, {
    ok: true,
    summary: {
      overall_state: "Normal",
      records_reviewed: enrichedRecentActivity.length,
      lifecycle_records: lifecycle.length,
      heartbeat_records: heartbeats.length,
      login_records: logins.length,
      backfilled_records: backfilled.length,
      active_users_today: activeUsers.length || uniqueCount(activeToday, "user_id") || profileActiveToday(profileUsers, activityEmailsToday).length,
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
    active_users: activeUsers,
    lifecycle,
    heartbeats: heartbeats.slice(0, 250),
    logins: logins.slice(0, 100),
    results: countBy(lifecycle, "result_quality"),
    market_modes: countBy(lifecycle, "market_mode"),
    strategies: countBy(lifecycle, "strategy"),
    pair_session_matrix: countBy(lifecycle, "pair"),
    user_activity: countBy(enrichedRecentActivity, "event_type"),
    active_countries: activeCountryRows.length
      ? activeCountryRows
      : (activityCountryRows.length ? activityCountryRows : (profileActiveCountries.length ? profileActiveCountries : licenseActiveCountries)),
    active_country_debug: {
      activity_emails_today: activityEmailsToday.size,
      heartbeat_country_rows: activeCountryRows.length,
      activity_country_rows: activityCountryRows.length,
      profile_country_rows: profileActiveCountries.length,
      license_country_rows: licenseActiveCountries.length,
    },
    pages: countBy(heartbeats, "page"),
    devices: countBy(recentActivity, "device_id"),
    risk_flags: [],
  });
};
