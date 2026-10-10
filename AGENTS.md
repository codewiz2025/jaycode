# JayCode Architecture

JayCode is a TanStack Start application deployed through Netlify's official TanStack adapter.

## Key directories

- `src/routes/` contains pages and server API routes.
- `src/components/` contains the IDE, editor, AI assistant, and shared UI.
- `src/lib/` contains IDE state helpers and server error handling.
- `src/workers/` contains browser workers, including Python execution.
- `src/assets/` and `public/` contain static brand assets.

## Conventions

- Use TypeScript and existing React component patterns.
- Keep browser-only APIs inside client-rendered components or effects.
- Keep provider credentials and external AI requests in server routes.
- Preserve the dark JayCode visual language and compact IDE layout.
- Prefer focused edits over broad component rewrites.

## Deployment decisions

- `vite.config.ts` includes the official Netlify TanStack Start adapter.
- `netlify.toml` defines the Bun build and `dist/client` publish directory.
- `/api/ai-chat` uses Netlify AI Gateway environment variables and never accepts API keys from the browser.
- Local provider keys belong in an ignored `.env` file; deployed keys belong in Netlify environment variables.
