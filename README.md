# MITPRO.ai Static Website

Static landing website for MIT PRO.

## Pages

- `index.html`
- `purchase.html`
- `risk-disclaimer.html`
- `privacy-policy.html`
- `terms-of-use.html`
- `contact.html`

## Vercel Deployment

1. Create a new Vercel project.
2. Upload or connect this folder.
3. Use the default static deployment settings.
4. Add the custom domain `mitpro.ai`.
5. Configure DNS using the records shown by Vercel.

## Contact Form

The contact page submits to the Vercel Serverless Function at `/api/contact`.

Required Vercel environment variables:

- `RESEND_API_KEY` - API key from Resend.
- `CONTACT_FROM` - verified sender, for example `MIT PRO <support@mitpro.ai>`.
- `CONTACT_TO` - support recipient list. Defaults to `support@mitpro.ai`. Multiple inboxes can be comma-separated.
- `CONTACT_ADMIN_TO` - optional admin recipient list for purchase/support copies. Multiple inboxes can be comma-separated.

Example:

```text
CONTACT_TO=support@mitpro.ai
CONTACT_ADMIN_TO=admin@mitpro.ai,owner@example.com
```

## Brand

- Support: `support@mitpro.ai`
- Subtitle: Adaptive Market Intelligence & Trader Protection Terminal
