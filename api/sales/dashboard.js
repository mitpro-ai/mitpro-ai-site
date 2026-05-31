const {
  canManageLicenses,
  countBy,
  daysUntil,
  getSessionUser,
  isMaster,
  planName,
  sendJson,
  supabaseRows,
  visibleForUser,
} = require("../_lib/partner-data");

function statusActive(row) {
  return String(row.status || row.license_status || "").toLowerCase() === "active";
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: "Method not allowed." });
  const user = getSessionUser(req);
  if (!user) return sendJson(res, 401, { ok: false, error: "Login required." });

  const [licensesAll, referralsAll, requestsAll, transactionsAll] = await Promise.all([
    supabaseRows("user_licenses", "select=*&order=expiry_date.asc&limit=800"),
    supabaseRows("employee_referrals", "select=*&order=employee_name.asc&limit=500"),
    supabaseRows("purchase_requests", "select=*&order=created_at.desc&limit=500"),
    supabaseRows("referral_transactions", "select=*&order=created_at.desc&limit=500"),
  ]);

  const licenses = visibleForUser(licensesAll, user);
  const referrals = visibleForUser(referralsAll, user);
  const activity = visibleForUser(transactionsAll.length ? transactionsAll : requestsAll, user);
  const due14 = licenses.filter((row) => {
    const days = daysUntil(row.expiry_date);
    return days !== null && days >= 0 && days <= 14;
  });
  const due30 = licenses.filter((row) => {
    const days = daysUntil(row.expiry_date);
    return days !== null && days >= 0 && days <= 30;
  });
  const blocked = licenses.filter((row) => {
    const days = daysUntil(row.expiry_date);
    return !statusActive(row) || (days !== null && days < 0);
  });
  const pending = requestsAll.filter((row) => String(row.status || row.payment_status || "").toLowerCase().includes("pending"));
  const role = String(user.role || "").toUpperCase();
  const insights = [
    { level: blocked.length ? "warn" : "good", title: "License Care", detail: blocked.length ? `${blocked.length} license record(s) need support review.` : "Tracked licenses are clean from block/expired review." },
    { level: due14.length ? "warn" : "good", title: "Renewal Focus", detail: due14.length ? `${due14.length} customer(s) need renewal follow-up inside 14 days.` : "No urgent renewal follow-up inside 14 days." },
    { level: "good", title: "Protected Follow-Up", detail: "Only customer care and approved partner context is shown for this role." },
  ];

  return sendJson(res, 200, {
    ok: true,
    role,
    can_view_financials: isMaster(user),
    can_manage_licenses: canManageLicenses(user),
    user,
    summary: {
      referral_codes: referrals.length,
      tracked_licenses: licenses.length,
      activity_records: activity.length,
      renewal_due_14d: due14.length,
      renewal_due_30d: due30.length,
      pending_requests: isMaster(user) || role === "SALES_SUPPORT_ADMIN" ? pending.length : 0,
      blocked_or_expired: blocked.length,
    },
    plan_mix: countBy(licenses, "plan_code"),
    status_mix: countBy(licenses, "status"),
    insights,
    referrals,
    licenses: licenses.map((row) => ({ ...row, plan_name: planName(row.plan_code) })),
    activity,
    renewal_due: due30,
    financial_summary: isMaster(user)
      ? {
          tracked_transactions: transactionsAll.length,
          tracked_requests: requestsAll.length,
          note: "Master only business layer from cloud records.",
        }
      : null,
  });
};
