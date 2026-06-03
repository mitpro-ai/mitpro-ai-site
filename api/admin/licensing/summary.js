const {
  canManageLicenses,
  getSessionUser,
  isMaster,
  sendJson,
  supabaseRows,
} = require("../../_lib/partner-data");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: "Method not allowed." });
  const user = getSessionUser(req);
  if (!user || !canManageLicenses(user)) return sendJson(res, 403, { ok: false, error: "License support access required." });
  const master = isMaster(user);
  const [plans, features, users, licenses, devices, events, referrals, commissions] = await Promise.all([
    supabaseRows("license_plans", "select=*&order=plan_code.asc&limit=80"),
    master ? supabaseRows("plan_features", "select=*&order=plan_code.asc&limit=300") : Promise.resolve([]),
    supabaseRows("users", "select=*&order=created_at.desc&limit=300"),
    supabaseRows("user_licenses", "select=*&order=created_at.desc&limit=500"),
    supabaseRows("user_devices", "select=*&order=last_seen.desc&limit=500"),
    supabaseRows("license_events", "select=*&order=created_at.desc&limit=300"),
    master ? supabaseRows("employee_referrals", "select=*&order=employee_name.asc&limit=300") : Promise.resolve([]),
    master ? supabaseRows("referral_transactions", "select=*&order=created_at.desc&limit=300") : Promise.resolve([]),
  ]);
  const hiddenMasterEmails = new Set(
    users.filter((row) => String(row.role || row.user_role || "").toUpperCase() === "MASTER").map((row) => String(row.email || row.user_email || "").toLowerCase())
  );
  const filterMaster = (row) => !hiddenMasterEmails.has(String(row.email || row.user_email || "").toLowerCase());
  const safeUsers = master ? users : users.filter(filterMaster);
  const safeLicenses = master ? licenses : licenses.filter(filterMaster);
  const safeDevices = master ? devices : devices.filter(filterMaster);
  const active = (row) => String(row.status || row.license_status || "").toLowerCase() === "active";
  return sendJson(res, 200, {
    ok: true,
    admin: user,
    access: { admin: true, master },
    overview: {
      plans: plans.length,
      features: features.length,
      users: safeUsers.length,
      licenses: safeLicenses.length,
      active_licenses: safeLicenses.filter(active).length,
      devices: safeDevices.length,
      active_devices: safeDevices.filter(active).length,
      referrals: referrals.length,
      pending_commission: 0,
    },
    feature_catalog: {},
    plans,
    features,
    users: safeUsers,
    licenses: safeLicenses,
    devices: safeDevices,
    referrals,
    commissions,
    events: master ? events : events.filter(filterMaster),
  });
};
