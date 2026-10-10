# Hosting JayCode on Netlify

JayCode is configured for Netlify with the official TanStack Start adapter. The site uses server-side routes for AI requests, so provider credentials are never included in browser code.

## Deploy

1. Connect this repository to the Netlify site.
2. Keep the build settings from `netlify.toml`.
3. Deploy the site.

Netlify AI Gateway supplies OpenAI and Anthropic credentials automatically on supported credit-based plans. No API key is required in the repository or browser.

## Use your own provider account

To bill requests directly to your provider account, add `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY` in **Netlify → Site configuration → Environment variables**. Netlify keeps these values server-side and uses them instead of the gateway-provided credentials.

Optional custom endpoints can be configured with `OPENAI_BASE_URL` and `ANTHROPIC_BASE_URL`.

Never commit real credentials to `.env`, `.env.example`, source files, or client-side code.

## Local development

```bash
bun install
cp .env.example .env
bun run dev
```

For local AI responses, add your provider credentials to `.env`. The deployed Netlify site does not require this when AI Gateway is available.

## Email confirmation (Resend)

New accounts must confirm their email before the workspace opens. Emails are sent with Resend.

1. In **Netlify → Site configuration → Environment variables**, add `RESEND_API_KEY`
   (scope: Functions/Runtime, mark as secret). Optionally add `EMAIL_FROM` and `EMAIL_VERIFY_SECRET`.
2. In **Identity → Registration**, turn **auto-confirm ON** so Netlify doesn't send its own
   second confirmation email. JayCode handles confirmation itself.
3. To email any address (not just your own), verify a domain in Resend and set `EMAIL_FROM`
   to an address on it.
4. Redeploy. The `email_verifications` table is created by the migration automatically.
