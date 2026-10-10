# JayCode

JayCode is a browser-based IDE by JayTech for editing and previewing HTML, CSS, JavaScript, and Python. It includes Monaco editing, live web previews, in-browser Python execution, a terminal-style console, file import/export, and an AI coding assistant.

## Technology

- TanStack Start, React, and TypeScript
- Tailwind CSS and Radix UI components
- Monaco Editor and Pyodide
- Netlify TanStack Start adapter
- Netlify AI Gateway for server-side AI requests

## Run locally

```bash
bun install
cp .env.example .env
bun run dev
```

Add local OpenAI or Anthropic credentials to `.env` only when testing AI features outside Netlify. See `HOSTING.md` for deployment details.

## Deploy

Connect the repository to Netlify. The included `netlify.toml` supplies the build command and publish directory, while the official adapter packages the TanStack Start server routes for Netlify.
