const { getSessionUser, sendJson, supabaseRows } = require("../../_lib/partner-data");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: "Method not allowed." });
  const user = getSessionUser(req);
  if (!user) return sendJson(res, 401, { ok: false, error: "Login required." });
  const events = await supabaseRows("arjun_protection_events", "select=*&order=created_at.desc&limit=500");
  const byEmail = new Map();
  for (const row of events) {
    const email = String(row.email || row.user_email || "").toLowerCase();
    if (!email) continue;
    const current = byEmail.get(email) || { email, status: "ATTENTION", holds: 0, cooldowns: 0, warnings: 0, last_reason: "" };
    current.holds += Number(row.holds || 0);
    current.cooldowns += Number(row.cooldowns || 0);
    current.warnings += Number(row.warnings || 0);
    if (!current.last_reason) current.last_reason = row.reason || row.event_type || "Protection review needed.";
    byEmail.set(email, current);
  }
  return sendJson(res, 200, { ok: true, watchlist: Array.from(byEmail.values()).slice(0, 100), messages: [] });
};
