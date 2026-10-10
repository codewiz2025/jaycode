import { createFileRoute } from "@tanstack/react-router";

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

interface Body {
  provider?: "jaycode" | "openai" | "anthropic";
  model?: string;
  messages?: ChatMessage[];
  context?: string;
}

const SYSTEM = [
  "You are JayCode AI, the in-editor pair programmer inside the JayCode IDE built by JayTech.",
  "You help with HTML, CSS, JavaScript and Python (running in-browser via Pyodide).",
  "Answer concisely, use fenced code blocks with the correct language, and prefer runnable snippets.",
].join(" ");

function sseTextStream(
  upstream: ReadableStream<Uint8Array>,
  extract: (json: unknown) => string,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const text = extract(JSON.parse(payload));
              if (text) controller.enqueue(encoder.encode(text));
            } catch {
              /* ignore partial frames */
            }
          }
        }
      } finally {
        controller.close();
        reader.releaseLock();
      }
    },
  });
}

const openAiDelta = (json: unknown) => {
  const choice = (json as { choices?: Array<{ delta?: { content?: string } }> }).choices?.[0];
  return choice?.delta?.content ?? "";
};

const anthropicDelta = (json: unknown) => {
  const event = json as { type?: string; delta?: { text?: string } };
  return event.type === "content_block_delta" ? (event.delta?.text ?? "") : "";
};

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function apiUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

export const Route = createFileRoute("/api/ai-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as Body;
        const provider = body.provider ?? "jaycode";
        const history = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
        if (!history.length) return new Response("No messages", { status: 400 });

        const system = body.context ? `${SYSTEM}\n\nOpen file context:\n${body.context}` : SYSTEM;

        let url: string;
        let headers: Record<string, string>;
        let payload: Record<string, unknown>;
        let extract: (json: unknown) => string;

        if (provider === "anthropic") {
          const key = env("ANTHROPIC_API_KEY");
          if (!key) {
            return new Response("Claude is not configured for this deployment", { status: 503 });
          }
          url = apiUrl(env("ANTHROPIC_BASE_URL") ?? "https://api.anthropic.com", "/v1/messages");
          headers = {
            "content-type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
          };
          payload = {
            model: body.model || "claude-sonnet-4-6",
            max_tokens: 2048,
            stream: true,
            system,
            messages: history.filter((m) => m.role !== "system"),
          };
          extract = anthropicDelta;
        } else {
          const key = env("OPENAI_API_KEY");
          if (!key) {
            return new Response("AI is not configured for this deployment", { status: 503 });
          }
          url = apiUrl(env("OPENAI_BASE_URL") ?? "https://api.openai.com", "/v1/chat/completions");
          headers = {
            "content-type": "application/json",
            authorization: `Bearer ${key}`,
          };
          payload = {
            model: body.model || (provider === "openai" ? "gpt-5.4" : "gpt-5.4-mini"),
            stream: true,
            messages: [{ role: "system", content: system }, ...history],
          };
          extract = openAiDelta;
        }

        const upstream = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        if (!upstream.ok || !upstream.body) {
          const detail = await upstream.text().catch(() => "");
          const message =
            upstream.status === 429
              ? "Rate limit reached — slow down and try again shortly."
              : upstream.status === 402
                ? "AI credits are exhausted. Add Netlify credits or configure a provider key."
                : upstream.status === 401 || upstream.status === 403
                  ? "The AI provider rejected the server-side credentials."
                  : detail.slice(0, 400) || "The AI provider returned an error.";
          return new Response(message, { status: upstream.status || 500 });
        }

        return new Response(sseTextStream(upstream.body, extract), {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
