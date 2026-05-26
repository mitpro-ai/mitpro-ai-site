const MAX_FIELD_LENGTH = 2000;

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
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

  if (!name || !email || !subject || !message) {
    return sendJson(res, 400, { ok: false, error: "Please complete name, email, subject, and message." });
  }
  if (!isValidEmail(email)) {
    return sendJson(res, 400, { ok: false, error: "Please enter a valid email address." });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CONTACT_FROM;
  const to = process.env.CONTACT_TO || "support@mitpro.ai";

  if (!apiKey || !from) {
    return sendJson(res, 503, {
      ok: false,
      error: "Contact service is not configured yet.",
      setupRequired: true,
      fallbackEmail: to,
    });
  }

  const text = [
    "MIT PRO website contact request",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    `Subject: ${subject}`,
    "",
    "Message:",
    message,
    "",
    "Support disclaimer: MIT PRO support does not provide financial advice, trading advice, or guaranteed trading outcomes.",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;">
      <h2>MIT PRO website contact request</h2>
      <p><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
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
