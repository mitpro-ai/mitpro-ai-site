const MAX_FIELD_LENGTH = 2000;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;
const DUPLICATE_WINDOW_MS = 30 * 60 * 1000;
const ALLOWED_ATTACHMENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);
const rateBuckets = new Map();
const recentRequests = new Map();

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function parseRecipients(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueRecipients(...groups) {
  return [...new Set(groups.flat().filter(Boolean))];
}

function clean(value, maxLength = MAX_FIELD_LENGTH) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanMessage(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().slice(0, MAX_FIELD_LENGTH);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isValidPhone(value) {
  const text = String(value || "").trim();
  if (!text) return true;
  return /^[+\d][\d\s().-]{6,24}$/.test(text);
}

function getSafeAttachment(value) {
  if (!value || typeof value !== "object") return null;
  const filename = clean(value.filename, 180).replace(/[^\w.\- ()]/g, "_");
  const contentType = clean(value.contentType, 80);
  const content = String(value.content || "").replace(/^data:[^;]+;base64,/, "");
  const size = Number(value.size || 0);

  if (!filename || !content || !ALLOWED_ATTACHMENT_TYPES.has(contentType)) {
    return { error: "Payment proof must be PNG, JPG, WEBP, or PDF." };
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_ATTACHMENT_BYTES) {
    return { error: "Payment proof must be 5 MB or smaller." };
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(content)) {
    return { error: "Payment proof could not be read safely." };
  }
  return { filename, contentType, content, size };
}

function getClientKey(req, email) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return `${forwarded || req.socket?.remoteAddress || "unknown"}:${email || "anonymous"}`;
}

function pruneMap(map, now, maxAge) {
  for (const [key, value] of map.entries()) {
    const timestamp = Array.isArray(value) ? value[0] : value;
    if (now - timestamp > maxAge) map.delete(key);
  }
}

function isRateLimited(req, email) {
  const now = Date.now();
  pruneMap(rateBuckets, now, RATE_WINDOW_MS);
  const key = getClientKey(req, email);
  const bucket = rateBuckets.get(key) || [];
  const fresh = bucket.filter((timestamp) => now - timestamp < RATE_WINDOW_MS);
  fresh.push(now);
  rateBuckets.set(key, fresh);
  return fresh.length > MAX_REQUESTS_PER_WINDOW;
}

function isDuplicateRequest(signature) {
  const now = Date.now();
  pruneMap(recentRequests, now, DUPLICATE_WINDOW_MS);
  if (recentRequests.has(signature)) return true;
  recentRequests.set(signature, now);
  return false;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

module.exports = async function contactHandler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, error: "Method not allowed." });
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: "Invalid request body." });
  }

  const honeypot = clean(body.company, 120);
  if (honeypot) return sendJson(res, 200, { ok: true });

  const name = clean(body.name, 120);
  const email = clean(body.email, 160);
  const subject = clean(body.subject || "MIT PRO Support Request", 160);
  const message = cleanMessage(body.message);
  const phone = clean(body.phone, 40);
  const plan = clean(body.plan, 24);
  const network = clean(body.network, 24);
  const attachment = getSafeAttachment(body.paymentProof);

  if (!name || !email || !subject || !message) {
    return sendJson(res, 400, { ok: false, error: "Please complete name, email, subject, and message." });
  }
  if (!isValidEmail(email)) {
    return sendJson(res, 400, { ok: false, error: "Please enter a valid email address." });
  }
  if (!isValidPhone(phone)) {
    return sendJson(res, 400, { ok: false, error: "Please enter a valid phone or WhatsApp number." });
  }
  if (attachment?.error) {
    return sendJson(res, 400, { ok: false, error: attachment.error });
  }
  if (isRateLimited(req, email)) {
    return sendJson(res, 429, { ok: false, error: "Too many requests. Please wait a few minutes and try again." });
  }

  const signature = `${email.toLowerCase()}|${subject.toLowerCase()}|${plan.toUpperCase()}|${network.toUpperCase()}|${message.slice(0, 260)}`;
  if (isDuplicateRequest(signature)) {
    return sendJson(res, 409, { ok: false, error: "This request was already received recently." });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CONTACT_FROM;
  const supportRecipients = parseRecipients(process.env.CONTACT_TO || "support@mitpro.ai");
  const adminRecipients = parseRecipients(process.env.CONTACT_ADMIN_TO || process.env.ADMIN_EMAIL);
  const to = uniqueRecipients(supportRecipients, adminRecipients);

  if (!apiKey || !from) {
    return sendJson(res, 503, {
      ok: false,
      error: "Contact service is not configured yet.",
      setupRequired: true,
      fallbackEmail: supportRecipients[0] || "support@mitpro.ai",
    });
  }
  if (!to.length) {
    return sendJson(res, 503, {
      ok: false,
      error: "Contact recipient is not configured yet.",
      setupRequired: true,
      fallbackEmail: "support@mitpro.ai",
    });
  }

  const text = [
    "MIT PRO website contact request",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    `Subject: ${subject}`,
    `Recipients: ${to.join(", ")}`,
    "",
    "Message:",
    message,
    "",
    `Payment proof: ${attachment ? `${attachment.filename} attached` : "Not attached"}`,
    "",
    "Support disclaimer: MIT PRO support does not provide financial advice, trading advice, or guaranteed trading outcomes.",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;">
      <h2>MIT PRO website contact request</h2>
      <p><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
      <p><strong>Payment proof:</strong> ${attachment ? `${escapeHtml(attachment.filename)} attached` : "Not attached"}</p>
      <hr>
      <p style="white-space:pre-wrap;">${escapeHtml(message)}</p>
      <hr>
      <p style="font-size:12px;color:#64748b;">MIT PRO support does not provide financial advice, trading advice, or guaranteed trading outcomes.</p>
    </div>
  `;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        reply_to: email,
        subject: `MIT PRO Support: ${subject}`,
        text,
        html,
        attachments: attachment ? [{
          filename: attachment.filename,
          content: attachment.content,
          content_type: attachment.contentType,
        }] : undefined,
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return sendJson(res, 502, {
        ok: false,
        error: result?.message || "Unable to send the message right now.",
      });
    }

    return sendJson(res, 200, { ok: true, id: result.id || null });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: "Contact service is temporarily unavailable." });
  }
};
