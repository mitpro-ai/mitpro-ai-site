const { getSessionUser, sendJson, supabaseRows } = require("../../_lib/partner-data");

function countBy(rows, key) {
  const out = {};
  for (const row of rows || []) {
    const value = String(row[key] || "UNKNOWN").toUpperCase();
    out[value] = (out[value] || 0) + 1;
  }
  return Object.entries(out).map(([key, count]) => ({ key, count }));
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: "Method not allowed." });
  const user = getSessionUser(req);
  if (!user) return sendJson(res, 401, { ok: false, error: "Login required." });
  const lifecycle = await supabaseRows("user_activity_logs", "select=*&event_type=eq.MARKET_LIFECYCLE&order=created_at.desc&limit=500");
  return sendJson(res, 200, {
    ok: true,
    summary: {
      overall_state: "Normal",
      records_reviewed: lifecycle.length,
      source_type: lifecycle.length ? "supabase" : "cloud_ready",
      cloud_sync: { cloud_enabled: true, pending_cloud_events: 0 },
    },
    lifecycle,
    results: countBy(lifecycle, "result_quality"),
    market_modes: countBy(lifecycle, "market_mode"),
    strategies: countBy(lifecycle, "strategy"),
    pair_session_matrix: countBy(lifecycle, "pair"),
    risk_flags: [],
  });
};
