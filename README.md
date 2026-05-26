# MITPRO.ai Static Website

Static landing website for MIT PRO.

## Pages

- `index.html`
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
- `CONTACT_TO` - optional recipient override. Defaults to `support@mitpro.ai`.

## Brand

- Support: `support@mitpro.ai`
- Subtitle: Adaptive Market Intelligence & Trader Protection Terminal
