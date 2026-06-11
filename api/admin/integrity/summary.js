const { getSessionUser, sendJson, supabaseRows } = require("../../_lib/partner-data");

function meta(row) {
  const value = row?.metadata_json || row?.metadata || {};
  return value && typeof value === "object" ? value : {};
}

function field(row, key) {
  const metadata = meta(row);
  const lifecycleRow = metadata?.lifecycle_row || {};
  const lifecycleContext = lifecycleRow?.integrity_context || {};
  const value = row?.[key] ?? metadata?.[key] ?? lifecycleRow?.[key] ?? lifecycleContext?.[key] ?? metadata?.integrity_context?.[key] ?? "";
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
    ca: "Canada",
    canada: "Canada",
    au: "Australia",
    australia: "Australia",
    pk: "Pakistan",
    pakistan: "Pakistan",
    bd: "Bangladesh",
    bangladesh: "Bangladesh",
    lk: "Sri Lanka",
    srilanka: "Sri Lanka",
    sg: "Singapore",
    singapore: "Singapore",
    my: "Malaysia",
    malaysia: "Malaysia",
    ph: "Philippines",
    philippines: "Philippines",
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

function lifecycleState(row) {
  const result = String(field(row, "result_quality") || field(row, "result") || field(row, "outcome") || field(row, "trade_result") || "").toUpperCase();
  if (result.includes("WORKED") || result.includes("WIN") || result.includes("SUCCESS") || result.includes("WEAK") || result.includes("LOSS") || result.includes("FAILED") || result.includes("REFUND")) return "RESULT";
  const text = String(field(row, "final_lifecycle") || field(row, "lifecycle") || field(row, "trade_mode") || field(row, "event") || field(row, "signal_category") || "").toUpperCase();
  if (text.includes("OBSERV")) return "OBSERVATION";
  if (text.includes("PENDING") || text.includes("PHASE")) return "PENDING";
  if (text.includes("ENTRY") || text.includes("VALIDATION")) return "ENTRY";
  if (text.includes("RESULT") || text.includes("WORKED") || text.includes("WEAK")) return "RESULT";
  if (text.includes("WATCH")) return "OBSERVATION";
  if (text.includes("BLOCK")) return "REVIEW";
  return "REVIEW";
}

function resultState(row) {
  const text = String(field(row, "result_quality") || field(row, "result") || field(row, "outcome") || field(row, "trade_result") || "").toUpperCase();
  if (text.includes("WORKED") || text.includes("WIN") || text.includes("SUCCESS")) return "WORKED";
  if (text.includes("WEAK") || text.includes("LOSS") || text.includes("FAILED")) return "WEAK";
  if (text.includes("REVIEW") || text.includes("BLOCK")) return "REVIEW";
  return "";
}

function brokerEvidence(row) {
  const metadata = meta(row);
  const lifecycleRow = metadata?.lifecycle_row || {};
  const direct = metadata?.broker_mode_evidence || lifecycleRow?.broker_mode_evidence || {};
  const mode = String(direct?.mode || field(row, "broker_account_mode") || "").trim().toUpperCase();
  if (!["DEMO", "REAL", "UNKNOWN"].includes(mode)) return null;
  return {
    mode,
    confidence: Number(direct?.confidence || 0) || 0,
    reason: String(direct?.reason || "").slice(0, 180),
    raw: String(direct?.raw || "").slice(0, 180),
    source: String(direct?.source || "shared_screen_visible_text"),
    event_time: row?.event_time || row?.created_at || field(row, "created_at_utc") || "",
    user_id: emailKey(field(row, "user_id") || field(row, "email") || field(row, "user_email")),
    session_id: String(field(row, "session_id") || "").trim(),
    device_id: String(field(row, "device_id") || "").trim(),
    country: field(row, "country") || "",
  };
}

function latestBrokerEvidence(rows) {
  const latest = new Map();
  for (const row of rows || []) {
    const evidence = brokerEvidence(row);
    if (!evidence) continue;
    const identity = evidence.user_id || evidence.device_id || evidence.session_id;
    if (!identity) continue;
    const time = Date.parse(evidence.event_time || "");
    const existing = latest.get(identity);
    const existingTime = Date.parse(existing?.event_time || "");
    if (!existing || (Number.isFinite(time) && (!Number.isFinite(existingTime) || time >= existingTime))) {
      latest.set(identity, evidence);
    }
  }
  return Array.from(latest.values()).sort((a, b) => Date.parse(b.event_time || "") - Date.parse(a.event_time || ""));
}

function sessionFromTime(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "UNKNOWN";
  const hour = date.getUTCHours();
  if (hour >= 0 && hour < 6) return "ASIA";
  if (hour >= 6 && hour < 12) return "LONDON";
  if (hour >= 12 && hour < 20) return "NEW YORK";
  return "LATE";
}

function rate(part, total) {
  total = Number(total) || 0;
  return total ? Math.round(((Number(part) || 0) / total) * 100) : 0;
}

function strategyPerformanceRows(rows) {
  const strategyMap = new Map();
  const matrixMap = new Map();
  for (const row of rows || []) {
    const lifecycle = lifecycleState(row);
    const result = resultState(row);
    const created = row?.event_time || row?.created_at || field(row, "created_at_utc") || field(row, "time") || "";
    const pair = String(field(row, "pair") || field(row, "pair_locked") || "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
    const strategy = String(field(row, "strategy") || field(row, "entry_type") || "UNKNOWN").trim().slice(0, 120) || "UNKNOWN";
    let marketMode = String(field(row, "market_mode") || field(row, "market") || "").trim().toUpperCase();
    if (!marketMode || marketMode === "UNKNOWN") marketMode = pair.endsWith(" OTC") ? "OTC" : "REAL";
    const session = String(field(row, "session") || field(row, "market_session") || sessionFromTime(created)).toUpperCase();

    const strategyItem = strategyMap.get(strategy) || {
      strategy,
      observations: 0,
      pending: 0,
      entries: 0,
      results: 0,
      worked: 0,
      weak: 0,
      review: 0,
      unclassified: 0,
      pairs: new Set(),
      market_modes: new Set(),
    };
    if (lifecycle === "OBSERVATION") strategyItem.observations += 1;
    else if (lifecycle === "PENDING") strategyItem.pending += 1;
    else if (lifecycle === "ENTRY") strategyItem.entries += 1;
    else if (lifecycle === "RESULT") strategyItem.results += 1;
    else strategyItem.unclassified += 1;
    if (result === "WORKED") strategyItem.worked += 1;
    else if (result === "WEAK") strategyItem.weak += 1;
    else if (result === "REVIEW") strategyItem.review += 1;
    strategyItem.pairs.add(pair);
    strategyItem.market_modes.add(marketMode);
    strategyMap.set(strategy, strategyItem);

    const matrixKey = `${pair}|${session}|${marketMode}`;
    const matrixItem = matrixMap.get(matrixKey) || {
      pair,
      session,
      market_mode: marketMode,
      observations: 0,
      pending: 0,
      entries: 0,
      results: 0,
      worked: 0,
      weak: 0,
      review: 0,
      unclassified: 0,
    };
    if (lifecycle === "OBSERVATION") matrixItem.observations += 1;
    else if (lifecycle === "PENDING") matrixItem.pending += 1;
    else if (lifecycle === "ENTRY") matrixItem.entries += 1;
    else if (lifecycle === "RESULT") matrixItem.results += 1;
    else matrixItem.unclassified += 1;
    if (result === "WORKED") matrixItem.worked += 1;
    else if (result === "WEAK") matrixItem.weak += 1;
    else if (result === "REVIEW") matrixItem.review += 1;
    matrixMap.set(matrixKey, matrixItem);
  }

  const strategies = Array.from(strategyMap.values()).map((item) => {
    const outcomeTotal = item.worked + item.weak;
    const lifecycleTotal = item.observations + item.pending + item.entries + item.results + item.unclassified;
    return {
      strategy: item.strategy,
      observations: item.observations,
      pending: item.pending,
      entries: item.entries,
      results: item.results,
      worked: item.worked,
      weak: item.weak,
      review: item.review,
      outcome_total: outcomeTotal,
      open_total: Math.max(0, lifecycleTotal - outcomeTotal),
      worked_rate: outcomeTotal ? rate(item.worked, outcomeTotal) : null,
      weak_rate: outcomeTotal ? rate(item.weak, outcomeTotal) : null,
      review_rate: rate(item.review, lifecycleTotal),
      pairs: item.pairs.size,
      market_modes: Array.from(item.market_modes).filter(Boolean).slice(0, 3).join(", ") || "UNKNOWN",
      count: lifecycleTotal,
    };
  }).sort((a, b) => (b.count - a.count) || (b.worked_rate - a.worked_rate));

  const matrix = Array.from(matrixMap.values()).map((item) => {
    const outcomeTotal = item.worked + item.weak;
    const records = item.observations + item.pending + item.entries + item.results + item.unclassified;
    return {
      ...item,
      outcome_total: outcomeTotal,
      open_total: Math.max(0, records - outcomeTotal),
      worked_rate: outcomeTotal ? rate(item.worked, outcomeTotal) : null,
      weak_rate: outcomeTotal ? rate(item.weak, outcomeTotal) : null,
      records,
    };
  }).sort((a, b) => b.records - a.records);

  return { strategies, matrix };
}

function resultText(row) {
  return String(field(row, "result_quality") || field(row, "result") || field(row, "outcome") || field(row, "trade_result") || "").toUpperCase();
}

function resultEventTime(row) {
  const value = Date.parse(row?.event_time || row?.created_at || field(row, "created_at_utc") || "");
  return Number.isFinite(value) ? value : 0;
}

function mergeSignalResultsIntoLifecycle(lifecycleRows, resultRows) {
  const byTradeId = new Map();
  for (const row of resultRows || []) {
    const tradeId = String(field(row, "trade_id") || "").trim();
    const result = resultText(row);
    if (!tradeId || !["WIN", "LOSS", "REFUND", "WORKED", "WEAK"].some((key) => result.includes(key))) continue;
    const existing = byTradeId.get(tradeId);
    if (!existing || resultEventTime(row) >= resultEventTime(existing)) byTradeId.set(tradeId, row);
  }

  let matched = 0;
  const merged = (lifecycleRows || []).map((row) => {
    const tradeId = String(field(row, "trade_id") || "").trim();
    const resultRow = tradeId ? byTradeId.get(tradeId) : null;
    if (!resultRow) return row;
    const result = resultText(resultRow);
    const metadata = { ...meta(row) };
    const lifecycleRow = { ...(metadata.lifecycle_row || {}) };
    const integrityContext = { ...(lifecycleRow.integrity_context || metadata.integrity_context || {}) };
    lifecycleRow.event = "result";
    lifecycleRow.entry_type = "RESULT";
    lifecycleRow.final_lifecycle = "RESULT";
    lifecycleRow.result = result;
    lifecycleRow.result_quality = result;
    integrityContext.event = "result";
    integrityContext.lifecycle = "RESULT";
    integrityContext.trade_mode = "RESULT";
    integrityContext.result_quality = result;
    lifecycleRow.integrity_context = integrityContext;
    metadata.lifecycle_row = lifecycleRow;
    matched += 1;
    return { ...row, metadata_json: metadata, _signal_result_merged: true };
  });

  return { rows: merged, matched, available: byTradeId.size };
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
    if (isServiceIdentity(identity) || isServiceIdentity(email)) continue;

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

function isServiceIdentity(value) {
  const key = String(value || "").trim().toLowerCase();
  return [
    "local_server",
    "server",
    "localhost",
    "system",
    "mitpro_server",
    "mitpro-local-server",
  ].includes(key);
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

function websiteField(row, key) {
  const metadata = meta(row);
  return row?.[key] ?? metadata?.[key] ?? "";
}

function websiteRows(rows) {
  return (rows || []).filter((row) => String(row.event_type || "").toUpperCase() === "WEBSITE_VISIT");
}

function uniqueWebsiteVisitors(rows) {
  const ids = new Set();
  for (const row of rows || []) {
    const id = String(row.device_id || row.session_id || websiteField(row, "visitor_hash") || row.ip_address || "").trim();
    if (id) ids.add(id);
  }
  return ids.size;
}

function websiteCountBy(rows, key) {
  const out = {};
  for (const row of rows || []) {
    let value = key === "country" ? normalizeCountry(row.country || websiteField(row, "country")) : websiteField(row, key);
    if (key === "page") value = String(value || "/").split("?")[0] || "/";
    value = String(value || "UNKNOWN").trim();
    if (!value) value = "UNKNOWN";
    out[value] = (out[value] || 0) + 1;
  }
  return Object.entries(out)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: "Method not allowed." });
  const user = getSessionUser(req);
  if (!user) return sendJson(res, 401, { ok: false, error: "Login required." });

  const [recentActivity, lifecycleActivity, signalResultActivity, profileUsers, licenseProfiles] = await Promise.all([
    supabaseRows("user_activity_logs", "select=*&order=event_time.desc&limit=1000"),
    supabaseRows("user_activity_logs", "select=*&event_type=eq.MARKET_LIFECYCLE&order=event_time.desc&limit=5000"),
    supabaseRows("user_activity_logs", "select=*&event_type=eq.SIGNAL_RESULT&order=event_time.desc&limit=5000"),
    supabaseRows("users", "select=*&limit=1000"),
    supabaseRows("user_licenses", "select=*&limit=1000"),
  ]);
  const userByEmail = new Map();
  for (const row of licenseProfiles || []) rememberProfile(userByEmail, row);
  for (const row of profileUsers || []) rememberProfile(userByEmail, row);
  const rawLifecycle = (lifecycleActivity.length ? lifecycleActivity : recentActivity)
    .filter((row) => String(row.event_type || "").toUpperCase() === "MARKET_LIFECYCLE");
  const resultMerge = mergeSignalResultsIntoLifecycle(rawLifecycle, signalResultActivity);
  const lifecycle = resultMerge.rows;
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
      .filter((value) => value && !isServiceIdentity(value)),
  );
  const activeCountryRows = countBy(activeToday, "country").filter((row) => row.key !== "UNKNOWN");
  const activityCountryRows = countUniqueByCountry(
    enrichedRecentActivity.filter((row) => isToday(row.event_time || row.created_at)),
  ).filter((row) => row.key !== "UNKNOWN");
  const activeUsers = activeUserRows(enrichedRecentActivity);
  const siteVisits = websiteRows(enrichedRecentActivity);
  const siteVisitsToday = siteVisits.filter((row) => isToday(row.event_time || row.created_at));
  const strategyPerformance = strategyPerformanceRows(lifecycle);
  const brokerEvidenceRows = latestBrokerEvidence([...enrichedRecentActivity, ...lifecycle]);
  const profileActiveCountries = countBy(countryRowsForActiveProfiles(profileUsers, userByEmail, activityEmailsToday), "key").filter((row) => row.key !== "UNKNOWN");
  const licenseActiveCountries = countBy(countryRowsForActiveProfiles(licenseProfiles, userByEmail, activityEmailsToday), "key").filter((row) => row.key !== "UNKNOWN");

  return sendJson(res, 200, {
    ok: true,
    summary: {
      overall_state: "Normal",
      records_reviewed: enrichedRecentActivity.length,
      lifecycle_records: lifecycle.length,
      signal_result_records: signalResultActivity.length,
      signal_results_matched: resultMerge.matched,
      signal_results_available: resultMerge.available,
      heartbeat_records: heartbeats.length,
      login_records: logins.length,
      website_visits_today: siteVisitsToday.length,
      website_unique_visitors_today: uniqueWebsiteVisitors(siteVisitsToday),
      website_total_visits_reviewed: siteVisits.length,
      backfilled_records: backfilled.length,
      active_users_today: activeUsers.length || uniqueCount(activeToday, "user_id") || profileActiveToday(profileUsers, activityEmailsToday).length,
      unique_users: uniqueCount(enrichedRecentActivity, "user_id"),
      unique_devices: uniqueCount(enrichedRecentActivity, "device_id"),
      unique_sessions: uniqueCount(enrichedRecentActivity, "session_id"),
      unique_ips: uniqueCount(enrichedRecentActivity, "ip_address"),
      unique_countries: uniqueCount(enrichedRecentActivity, "country"),
      unique_pairs: uniqueCount(lifecycle, "pair"),
      broker_real_users: brokerEvidenceRows.filter((row) => row.mode === "REAL").length,
      broker_demo_users: brokerEvidenceRows.filter((row) => row.mode === "DEMO").length,
      broker_unknown_users: brokerEvidenceRows.filter((row) => row.mode === "UNKNOWN").length,
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
    broker_modes: countBy(brokerEvidenceRows, "mode"),
    broker_evidence: brokerEvidenceRows.slice(0, 100),
    strategies: strategyPerformance.strategies,
    pair_session_matrix: strategyPerformance.matrix,
    user_activity: countBy(enrichedRecentActivity, "event_type"),
    website: {
      visits_today: siteVisitsToday.length,
      unique_visitors_today: uniqueWebsiteVisitors(siteVisitsToday),
      total_visits_reviewed: siteVisits.length,
      countries_today: websiteCountBy(siteVisitsToday, "country").filter((row) => row.key !== "UNKNOWN"),
      pages_today: websiteCountBy(siteVisitsToday, "page").slice(0, 12),
      recent: siteVisits.slice(0, 80).map((row) => ({
        page: websiteField(row, "page") || "/",
        country: normalizeCountry(row.country || websiteField(row, "country")) || "Country pending",
        city: websiteField(row, "city") || "",
        region: websiteField(row, "region") || "",
        timezone: websiteField(row, "timezone") || "",
        event_time: row.event_time || row.created_at || "",
      })),
    },
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
