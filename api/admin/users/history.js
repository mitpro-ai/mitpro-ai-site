const { canManageLicenses, getSessionUser, sendJson, supabaseRows } = require("../../_lib/partner-data");

function meta(row) {
  const value = row?.metadata_json || row?.metadata || {};
  return value && typeof value === "object" ? value : {};
}

function deepFind(source, keys) {
  const wanted = new Set(keys.map((key) => String(key).toLowerCase()));
  const found = [];
  function walk(value) {
    if (!value || found.length) return;
    if (Array.isArray(value)) return value.forEach(walk);
    if (typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if (wanted.has(String(key).toLowerCase()) && item !== undefined && item !== null && item !== "") {
        found.push(item);
        return;
      }
      walk(item);
      if (found.length) return;
    }
  }
  walk(source);
  return found[0];
}

function rowField(row, names) {
  const metadata = meta(row);
  for (const name of names) {
    if (row?.[name] !== undefined && row?.[name] !== null && row?.[name] !== "") return row[name];
  }
  return deepFind(metadata, names);
}

function emailKey(value) {
  return String(value || "").trim().toLowerCase();
}

function eventTime(row) {
  return row?.event_time || row?.created_at || rowField(row, ["created_at_utc", "time", "signal_time"]) || "";
}

function lifecycleState(row) {
  const eventType = String(row.event_type || "").toUpperCase();
  if (eventType === "SIGNAL_WATCH") return "OBSERVATION";
  if (eventType === "SIGNAL_PENDING") return "PENDING";
  if (eventType === "SIGNAL_ENTRY") return "VALIDATION";
  if (eventType === "SIGNAL_RESULT") return "RESULT";
  const text = String(rowField(row, ["final_lifecycle", "lifecycle", "trade_mode", "event", "signal_stage", "validation"]) || "").toUpperCase();
  const result = String(rowField(row, ["result_quality", "result", "outcome", "trade_result"]) || "").toUpperCase();
  if (result.includes("WIN") || result.includes("WORKED") || result.includes("LOSS") || result.includes("WEAK") || result.includes("REFUND")) return "RESULT";
  if (text.includes("OBSERV") || text.includes("WATCH")) return "OBSERVATION";
  if (text.includes("PENDING") || text.includes("PHASE")) return "PENDING";
  if (text.includes("ENTRY") || text.includes("VALIDATION")) return "VALIDATION";
  if (text.includes("BLOCK")) return "BLOCKED";
  return "";
}

function resultState(row) {
  const value = String(rowField(row, ["result_quality", "result", "outcome", "trade_result"]) || "").toUpperCase();
  if (value.includes("WIN") || value.includes("WORKED") || value.includes("SUCCESS")) return "WORKED";
  if (value.includes("LOSS") || value.includes("WEAK") || value.includes("FAILED")) return "WEAK";
  if (value.includes("REFUND")) return "REFUND";
  if (value.includes("REVIEW") || value.includes("BLOCK")) return "REVIEW";
  return "";
}

function isIdle(row) {
  const value = rowField(row, ["idle"]);
  return value === true || String(value).toLowerCase() === "true";
}

function formatSeconds(value) {
  const seconds = Math.max(0, Math.round(Number(value) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function addCount(map, key) {
  key = String(key || "").trim() || "UNKNOWN";
  map[key] = (map[key] || 0) + 1;
}

function uniqueRows(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    const key = [
      row.id,
      row.event_id,
      row.event_time || row.created_at,
      row.event_type,
      row.session_id,
      row.user_id,
      JSON.stringify(meta(row)).slice(0, 200),
    ].filter(Boolean).join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function countRows(rows, names) {
  const out = {};
  for (const row of rows || []) addCount(out, rowField(row, names));
  return Object.entries(out).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

function summarizeSessions(rows) {
  const sessions = new Map();
  for (const row of rows || []) {
    const sessionId = String(row.session_id || rowField(row, ["session_id"]) || "unknown").trim();
    const time = Date.parse(eventTime(row));
    if (!Number.isFinite(time)) continue;
    const session = sessions.get(sessionId) || { session_id: sessionId, first: time, last: time, heartbeats: [], idle_heartbeats: 0, event_count: 0 };
    session.first = Math.min(session.first, time);
    session.last = Math.max(session.last, time);
    session.event_count += 1;
    if (String(row.event_type || "").toUpperCase() === "HEARTBEAT") {
      session.heartbeats.push({ time, idle: isIdle(row), page: rowField(row, ["page"]), market_mode: rowField(row, ["market_mode"]) });
      if (isIdle(row)) session.idle_heartbeats += 1;
    }
    sessions.set(sessionId, session);
  }

  let totalSeconds = 0;
  let activeSeconds = 0;
  let idleSeconds = 0;
  const rowsOut = Array.from(sessions.values()).map((session) => {
    const duration = Math.max(0, Math.round((session.last - session.first) / 1000));
    totalSeconds += duration;
    const beats = session.heartbeats.sort((a, b) => a.time - b.time);
    for (let i = 0; i < beats.length; i += 1) {
      const next = beats[i + 1]?.time || Math.min(session.last, beats[i].time + 60000);
      const delta = Math.max(0, Math.min(180, Math.round((next - beats[i].time) / 1000)));
      if (beats[i].idle) idleSeconds += delta;
      else activeSeconds += delta;
    }
    return {
      session_id: session.session_id,
      start: new Date(session.first).toISOString(),
      end: new Date(session.last).toISOString(),
      duration_seconds: duration,
      duration_label: formatSeconds(duration),
      heartbeats: beats.length,
      idle_heartbeats: session.idle_heartbeats,
      event_count: session.event_count,
    };
  }).sort((a, b) => Date.parse(b.end) - Date.parse(a.end));

  return {
    total_seconds: totalSeconds,
    active_seconds: activeSeconds,
    idle_seconds: idleSeconds,
    total_label: formatSeconds(totalSeconds),
    active_label: formatSeconds(activeSeconds),
    idle_label: formatSeconds(idleSeconds),
    rows: rowsOut,
  };
}

function withinDays(row, days) {
  if (!days) return true;
  const time = Date.parse(eventTime(row));
  return Number.isFinite(time) && time >= Date.now() - (Number(days) * 86400000);
}

function isTodayRow(row) {
  const time = Date.parse(eventTime(row));
  if (!Number.isFinite(time)) return false;
  const now = new Date();
  const event = new Date(time);
  return event.getUTCFullYear() === now.getUTCFullYear()
    && event.getUTCMonth() === now.getUTCMonth()
    && event.getUTCDate() === now.getUTCDate();
}

function cleanDate(value) {
  const text = String(value || "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function dateWindow(startDate, endDate) {
  let start = cleanDate(startDate);
  let end = cleanDate(endDate);
  if (start && end && start > end) [start, end] = [end, start];
  if (start && !end) end = start;
  if (end && !start) start = end;
  if (!start || !end) return null;
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T23:59:59.999Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return { start, end, startMs, endMs };
}

function withinDateWindow(row, window) {
  if (!window) return true;
  const time = Date.parse(eventTime(row));
  return Number.isFinite(time) && time >= window.startMs && time <= window.endMs;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: "Method not allowed." });
  const user = getSessionUser(req);
  if (!user || !canManageLicenses(user)) return sendJson(res, 403, { ok: false, error: "License support access required." });

  const email = emailKey(req.query?.email);
  if (!email || !email.includes("@")) return sendJson(res, 400, { ok: false, error: "User email is required." });
  const rawDays = String(req.query?.days || "30").toUpperCase();
  const todayOnly = rawDays === "TODAY";
  const days = todayOnly ? 1 : Math.max(1, Math.min(365, Number(req.query?.days || 30) || 30));
  const filter = String(req.query?.filter || "ALL").toUpperCase();
  const selectedWindow = dateWindow(req.query?.start_date, req.query?.end_date);

  const [activityRows, lifecycleRows, resultRows, userRows, licenseRows, deviceRows, agreementRows] = await Promise.all([
    supabaseRows("user_activity_logs", `select=*&user_id=eq.${encodeURIComponent(email)}&order=event_time.desc&limit=5000`),
    supabaseRows("user_activity_logs", `select=*&event_type=eq.MARKET_LIFECYCLE&order=event_time.desc&limit=5000`),
    supabaseRows("user_activity_logs", `select=*&event_type=eq.SIGNAL_RESULT&order=event_time.desc&limit=5000`),
    supabaseRows("users", `select=*&email=eq.${encodeURIComponent(email)}&limit=5`),
    supabaseRows("user_licenses", `select=*&email=eq.${encodeURIComponent(email)}&limit=20`),
    supabaseRows("user_devices", `select=*&email=eq.${encodeURIComponent(email)}&order=last_seen.desc&limit=50`),
    supabaseRows("user_agreements", `select=*&email=eq.${encodeURIComponent(email)}&order=accepted_at.desc&limit=20`),
  ]);

  const emailMatches = (row) => {
    const candidates = [
      row.user_id,
      row.email,
      row.user_email,
      rowField(row, ["user_id", "email", "user_email"]),
      rowField(row, ["integrity_context", "user_email"]),
    ].map(emailKey);
    return candidates.includes(email);
  };
  const allRows = uniqueRows([...activityRows, ...lifecycleRows.filter(emailMatches), ...resultRows.filter(emailMatches)])
    .filter((row) => selectedWindow ? withinDateWindow(row, selectedWindow) : todayOnly ? isTodayRow(row) : withinDays(row, days))
    .sort((a, b) => Date.parse(eventTime(b) || 0) - Date.parse(eventTime(a) || 0));

  const sessions = summarizeSessions(allRows);
  const todaySessions = summarizeSessions(allRows.filter(isTodayRow));
  const lifecycleCounts = {};
  const resultCounts = {};
  const eventCounts = {};
  for (const row of allRows) {
    addCount(eventCounts, row.event_type || "UNKNOWN");
    const lifecycle = lifecycleState(row);
    if (lifecycle) addCount(lifecycleCounts, lifecycle);
    const result = resultState(row);
    if (result) addCount(resultCounts, result);
  }

  const lifecycleRowsOnly = allRows.filter((row) => lifecycleState(row));
  const heartbeats = allRows.filter((row) => String(row.event_type || "").toUpperCase() === "HEARTBEAT");
  const logins = allRows.filter((row) => String(row.event_type || "").toUpperCase() === "LOGIN");
  const logouts = allRows.filter((row) => String(row.event_type || "").toUpperCase() === "LOGOUT");
  const idleHeartbeats = heartbeats.filter(isIdle);
  const marketActivity = lifecycleRowsOnly.length + allRows.filter((row) => String(row.event_type || "").toUpperCase().startsWith("SIGNAL_")).length;

  let timeline = allRows.map((row) => {
    const lifecycle = lifecycleState(row);
    const result = resultState(row);
    return {
      time: eventTime(row),
      event_type: row.event_type || "UNKNOWN",
      lifecycle,
      result,
      pair: rowField(row, ["pair", "pair_name", "symbol", "asset"]) || "",
      direction: rowField(row, ["direction", "signal_direction", "side", "bias"]) || "",
      confidence: rowField(row, ["confidence", "confidence_score", "score", "guidance_score"]) || "",
      market_mode: rowField(row, ["market_mode", "market_type", "mode"]) || "",
      page: rowField(row, ["page"]) || "",
      strategy: rowField(row, ["strategy", "strategy_used", "entry_type"]) || "",
      idle: isIdle(row),
      session_id: row.session_id || "",
      country: row.country || rowField(row, ["country"]) || "",
    };
  });
  if (filter !== "ALL") {
    timeline = timeline.filter((row) => {
      if (filter === "LOGIN") return row.event_type === "LOGIN" || row.event_type === "LOGOUT";
      if (filter === "HEARTBEAT") return row.event_type === "HEARTBEAT";
      if (filter === "OBSERVATION") return row.lifecycle === "OBSERVATION";
      if (filter === "VALIDATION") return row.lifecycle === "VALIDATION" || row.lifecycle === "PENDING";
      if (filter === "RESULT") return row.lifecycle === "RESULT";
      if (filter === "IDLE") return row.idle;
      if (filter === "MARKET") return Boolean(row.lifecycle || row.event_type.startsWith("SIGNAL_"));
      return true;
    });
  }

  return sendJson(res, 200, {
    ok: true,
    email,
    days: todayOnly ? "TODAY" : days,
    start_date: selectedWindow?.start || "",
    end_date: selectedWindow?.end || "",
    filter,
    profile: userRows[0] || null,
    licenses: licenseRows,
    devices: deviceRows,
    agreements: agreementRows,
    summary: {
      records: allRows.length,
      sessions: sessions.rows.length,
      total_time: sessions.total_label,
      today_time: todaySessions.total_label,
      today_active_time: todaySessions.active_label,
      today_idle_time: todaySessions.idle_label,
      today_sessions: todaySessions.rows.length,
      active_time: sessions.active_label,
      idle_time: sessions.idle_label,
      logins: logins.length,
      logouts: logouts.length,
      heartbeats: heartbeats.length,
      idle_heartbeats: idleHeartbeats.length,
      market_activity: marketActivity,
      observations: lifecycleCounts.OBSERVATION || 0,
      pending: lifecycleCounts.PENDING || 0,
      validations: lifecycleCounts.VALIDATION || 0,
      blocked: lifecycleCounts.BLOCKED || 0,
      results: lifecycleCounts.RESULT || 0,
      worked: resultCounts.WORKED || 0,
      weak: resultCounts.WEAK || 0,
      refund: resultCounts.REFUND || 0,
      review: resultCounts.REVIEW || 0,
    },
    event_counts: Object.entries(eventCounts).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
    lifecycle_counts: Object.entries(lifecycleCounts).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
    result_counts: Object.entries(resultCounts).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
    pairs: countRows(lifecycleRowsOnly, ["pair", "pair_name", "symbol", "asset"]).slice(0, 20),
    market_modes: countRows(allRows, ["market_mode", "market_type", "mode"]).slice(0, 10),
    pages: countRows(heartbeats, ["page"]).slice(0, 10),
    sessions: sessions.rows.slice(0, 50),
    timeline: timeline.slice(0, 500),
    note: "Screen sharing is inferred from market lifecycle/frame activity unless a direct share event is present in the user's build.",
  });
};
