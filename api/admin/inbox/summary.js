const {
  getSessionUser,
  isMaster,
  sendJson,
} = require("../../_lib/partner-data");

const INBOXES = [
  { key: "support", email: "support@mitpro.ai", title: "Support Inbox" },
  { key: "admin", email: "admin@mitpro.ai", title: "Admin Inbox" },
];

const URGENT_WORDS = ["urgent", "refund", "complaint", "legal", "blocked", "license", "payment", "failed", "can't login", "cannot login"];
const SALES_WORDS = ["purchase", "pricing", "license", "enterprise", "partnership", "partner", "demo", "trial"];

function hasAny(text, words) {
  const value = String(text || "").toLowerCase();
  return words.some((word) => value.includes(word));
}

function categoryFor(message) {
  const text = `${message.subject || ""} ${message.snippet || ""}`.toLowerCase();
  if (text.includes("refund")) return "Refund / Payment";
  if (text.includes("payment") || text.includes("invoice") || text.includes("receipt")) return "Payment Issue";
  if (text.includes("license") || text.includes("key")) return "License Issue";
  if (text.includes("login") || text.includes("password") || text.includes("access")) return "Login Problem";
  if (text.includes("bug") || text.includes("error") || text.includes("not working")) return "Technical Support";
  if (text.includes("feature") || text.includes("request")) return "Feature Request";
  if (text.includes("partner") || text.includes("enterprise")) return "Partnership";
  if (text.includes("legal") || text.includes("privacy") || text.includes("terms")) return "Legal / Admin";
  return "General Inquiry";
}

function emptyInbox(row, connected, error = "") {
  return {
    ...row,
    connected,
    error,
    total_today: 0,
    unread: 0,
    urgent: 0,
    support_requests: 0,
    sales_leads: 0,
    categories: {},
    priority: [],
  };
}

function authToken() {
  return process.env.MITPRO_GMAIL_ACCESS_TOKEN || process.env.GOOGLE_WORKSPACE_ACCESS_TOKEN || "";
}

async function gmailJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error?.message || `Gmail API returned ${response.status}`);
  }
  return response.json();
}

function headerValue(payload, name) {
  const headers = payload?.headers || [];
  const item = headers.find((h) => String(h.name || "").toLowerCase() === name.toLowerCase());
  return item?.value || "";
}

async function readInbox(row, token) {
  const encodedUser = encodeURIComponent(row.email);
  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/${encodedUser}/messages?maxResults=25&q=${encodeURIComponent("newer_than:1d")}`;
  const list = await gmailJson(listUrl, token);
  const ids = (list.messages || []).map((m) => m.id).filter(Boolean);
  const messages = await Promise.all(ids.slice(0, 18).map(async (id) => {
    const detailUrl = `https://gmail.googleapis.com/gmail/v1/users/${encodedUser}/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`;
    const data = await gmailJson(detailUrl, token);
    const subject = headerValue(data.payload, "Subject") || "(No subject)";
    const from = headerValue(data.payload, "From") || "Unknown sender";
    const text = `${subject} ${data.snippet || ""}`;
    return {
      id,
      from,
      subject,
      snippet: data.snippet || "",
      unread: (data.labelIds || []).includes("UNREAD"),
      urgent: hasAny(text, URGENT_WORDS),
      sales: hasAny(text, SALES_WORDS),
      category: categoryFor({ subject, snippet: data.snippet || "" }),
    };
  }));
  const categories = {};
  for (const message of messages) categories[message.category] = (categories[message.category] || 0) + 1;
  return {
    ...row,
    connected: true,
    error: "",
    total_today: Number(list.resultSizeEstimate || messages.length || 0),
    unread: messages.filter((m) => m.unread).length,
    urgent: messages.filter((m) => m.urgent).length,
    support_requests: messages.filter((m) => ["License Issue", "Login Problem", "Payment Issue", "Technical Support", "Feature Request", "Refund / Payment"].includes(m.category)).length,
    sales_leads: messages.filter((m) => m.sales || ["Partnership"].includes(m.category)).length,
    categories,
    priority: messages.filter((m) => m.urgent || m.sales).slice(0, 6),
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: "Method not allowed." });
  const user = getSessionUser(req);
  if (!user || !isMaster(user)) return sendJson(res, 403, { ok: false, error: "MASTER access required for founder inbox." });

  const token = authToken();
  if (!token) {
    return sendJson(res, 200, {
      ok: true,
      connected: false,
      source: "google_workspace",
      status: "credentials_required",
      inboxes: INBOXES.map((row) => emptyInbox(row, false, "Google Workspace access token not configured.")),
      briefing: {
        emails_today: 0,
        unread: 0,
        urgent: 0,
        support_requests: 0,
        sales_leads: 0,
        message: "Connect Google Workspace to activate live founder inbox metrics.",
      },
    });
  }

  const inboxes = await Promise.all(INBOXES.map((row) => readInbox(row, token).catch((error) => emptyInbox(row, false, error.message))));
  const total = (key) => inboxes.reduce((n, inbox) => n + Number(inbox[key] || 0), 0);
  return sendJson(res, 200, {
    ok: true,
    connected: inboxes.some((inbox) => inbox.connected),
    source: "google_workspace",
    status: inboxes.some((inbox) => inbox.connected) ? "connected" : "error",
    inboxes,
    briefing: {
      emails_today: total("total_today"),
      unread: total("unread"),
      urgent: total("urgent"),
      support_requests: total("support_requests"),
      sales_leads: total("sales_leads"),
      message: inboxes.some((inbox) => inbox.connected) ? "Founder inbox summary is live." : "Google Workspace returned no connected inboxes.",
    },
  });
};
