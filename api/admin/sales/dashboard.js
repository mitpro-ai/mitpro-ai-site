const { getSessionUser, isMaster, sendJson, supabaseRows } = require("../../_lib/partner-data");

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
  if (!isMaster(user)) return sendJson(res, 403, { ok: false, error: "Master access required." });
  const [licenses, referrals, commissions, requests, plans] = await Promise.all([
    supabaseRows("user_licenses", "select=*&order=created_at.desc&limit=800"),
    supabaseRows("employee_referrals", "select=*&order=employee_name.asc&limit=500"),
    supabaseRows("referral_transactions", "select=*&order=created_at.desc&limit=500"),
    supabaseRows("purchase_requests", "select=*&order=created_at.desc&limit=500"),
    supabaseRows("license_plans", "select=*&order=plan_code.asc&limit=80"),
  ]);
  const active = licenses.filter((row) => String(row.status || row.license_status || "").toLowerCase() === "active");
  const due30 = licenses.filter((row) => {
    const expiry = Date.parse(row.expiry_date || "");
    return Number.isFinite(expiry) && expiry >= Date.now() && expiry <= Date.now() + 30 * 86400000;
  });
  return sendJson(res, 200, {
    ok: true,
    admin: user,
    summary: {
      requests: requests.length,
      licenses: licenses.length,
      active_licenses: active.length,
      renewal_due_30d: due30.length,
      estimated_paid: 0,
      estimated_pipeline: 0,
      referrals: referrals.length,
      pending_commission: 0,
      paid_commission: 0,
    },
    payment_mix: countBy(requests, "payment_status"),
    request_status: countBy(requests, "status"),
    plan_mix: countBy(requests, "plan_code"),
    monthly_requests: [],
    license_plan_mix: countBy(licenses, "plan_code"),
    renewal_due: due30.slice(0, 50),
    recent_requests: requests.slice(0, 30),
    referrals: referrals.slice(0, 80),
    commissions: commissions.slice(0, 80),
    plans,
  });
};
