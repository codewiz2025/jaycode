import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Send, Settings2, Sparkles, Trash2, Wand2 } from "lucide-react";

export type AiProvider = "jaycode" | "openai" | "anthropic";

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const PROVIDER_STORAGE = "jaycode.ai.provider.v1";

const PROVIDERS: Record<AiProvider, { label: string; hint: string; defaultModel: string }> = {
  jaycode: {
    label: "JayCode AI",
    hint: "Fast built-in coding help through Netlify AI Gateway.",
    defaultModel: "gpt-5.4-mini",
  },
  openai: {
    label: "ChatGPT",
    hint: "Uses the deployment's secure OpenAI connection.",
    defaultModel: "gpt-5.4",
  },
  anthropic: {
    label: "Claude",
    hint: "Uses the deployment's secure Anthropic connection.",
    defaultModel: "claude-sonnet-4-6",
  },
};

const uid = () => Math.random().toString(36).slice(2, 10);

function renderContent(text: string) {
  const parts = text.split(/```(\w*)\n?([\s\S]*?)```/g);
  const out: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; i += 3) {
    if (parts[i]) out.push(<p key={`t${i}`} className="whitespace-pre-wrap">{parts[i]}</p>);
    const code = parts[i + 2];
    if (code !== undefined) {
      out.push(
        <pre
          key={`c${i}`}
          className="my-2 overflow-x-auto rounded-md border border-primary/25 bg-black/60 p-2 font-mono text-[11.5px] text-sky-200"
        >
          <code>{code.replace(/\n$/, "")}</code>
        </pre>,
      );
    }
  }
  return out;
}

interface Props {
  fileName?: string | undefined;
  fileLanguage?: string | undefined;
  fileContent?: string | undefined;
  onInsert?: (code: string) => void;
}

export function AIAssistant({ fileName, fileLanguage, fileContent }: Props) {
  const [provider, setProvider] = useState<AiProvider>("jaycode");
  const [model, setModel] = useState(PROVIDERS.jaycode.defaultModel);
  const [showSettings, setShowSettings] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [useContext, setUseContext] = useState(true);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const storedProvider = localStorage.getItem(PROVIDER_STORAGE) as AiProvider | null;
      if (storedProvider && PROVIDERS[storedProvider]) {
        setProvider(storedProvider);
        setModel(PROVIDERS[storedProvider].defaultModel);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const pickProvider = (next: AiProvider) => {
    setProvider(next);
    setModel(PROVIDERS[next].defaultModel);
    setError("");
    try {
      localStorage.setItem(PROVIDER_STORAGE, next);
    } catch {
      /* quota */
    }
  };

  const send = async (text: string) => {
    const prompt = text.trim();
    if (!prompt || busy) return;
    setError("");
    setInput("");

    const nextMessages: Msg[] = [...messages, { id: uid(), role: "user", content: prompt }];
    const assistantId = uid();
    setMessages([...nextMessages, { id: assistantId, role: "assistant", content: "" }]);
    setBusy(true);

    try {
      const response = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider,
          model,
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
          context:
            useContext && fileContent
              ? `File: ${fileName} (${fileLanguage})\n\n${fileContent.slice(0, 8000)}`
              : undefined,
        }),
      });

      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => "");
        throw new Error(detail || `Request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: acc } : m)),
        );
      }
      if (!acc.trim()) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: "_(no response returned)_" } : m,
          ),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setBusy(false);
    }
  };

  const quick = (label: string, prompt: string) => (
    <button
      key={label}
      onClick={() => void send(prompt)}
      className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-primary/60 hover:text-primary"
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[oklch(0.13_0.02_255)]">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-[11px] uppercase tracking-widest text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-primary">AI Assistant</span>
        <button
          onClick={() => setMessages([])}
          className="ml-auto normal-case tracking-normal hover:text-primary"
          title="Clear chat"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2">
        {(Object.keys(PROVIDERS) as AiProvider[]).map((key) => (
          <button
            key={key}
            onClick={() => pickProvider(key)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
              provider === key
                ? "bg-primary/20 text-primary shadow-[inset_0_0_0_1px_var(--primary)]"
                : "text-muted-foreground hover:bg-secondary/60"
            }`}
          >
            {PROVIDERS[key].label}
          </button>
        ))}
        <button
          onClick={() => setShowSettings((value) => !value)}
          className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
          title="Model settings"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Settings
        </button>
      </div>

      {showSettings && (
        <div className="space-y-2 border-b border-border bg-black/25 px-3 py-2.5">
          <p className="text-[11px] text-muted-foreground">{PROVIDERS[provider].hint}</p>
          <label className="block text-[10px] uppercase tracking-widest text-muted-foreground">
            Model
          </label>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-md border border-border bg-black/40 px-2 py-1.5 font-mono text-[11.5px] outline-none focus:border-primary/70"
          />
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 text-[12.5px]">
        {!messages.length && (
          <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 text-muted-foreground">
            <p className="flex items-center gap-2 font-semibold text-foreground">
              <Bot className="h-4 w-4 text-primary" /> Ask about your code
            </p>
            <p className="mt-1 text-[11.5px]">
              Choose JayCode AI, ChatGPT, or Claude. Provider credentials stay securely on the
              server and are never stored in the browser.
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`rounded-lg border px-3 py-2 ${
              message.role === "user"
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-border bg-black/30 text-foreground/90"
            }`}
          >
            <p className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
              {message.role === "user" ? "You" : PROVIDERS[provider].label}
            </p>
            {message.content ? (
              renderContent(message.content)
            ) : (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            )}
          </div>
        ))}

        {error && (
          <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-[11.5px] text-destructive">
            {error}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex flex-wrap gap-1.5 border-t border-border px-3 py-2">
        {quick("Explain file", `Explain what ${fileName ?? "this file"} does, step by step.`)}
        {quick("Find bugs", "Review the open file for bugs and suggest fixes.")}
        {quick("Improve", "Refactor the open file to be cleaner and faster. Show the full code.")}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="border-t border-border p-2"
      >
        <div className="flex items-end gap-2 rounded-lg border border-border bg-black/40 px-2 py-1.5 focus-within:border-primary/60">
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder="Ask JayCode AI to write or fix code…"
            className="min-h-0 flex-1 resize-none bg-transparent text-[12.5px] outline-none placeholder:text-muted-foreground/70"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="mb-0.5 flex items-center gap-1 rounded-md border border-primary/70 bg-primary/20 px-2.5 py-1.5 text-[11px] font-semibold text-primary disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Send
          </button>
        </div>
        <label className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
          <input
            type="checkbox"
            checked={useContext}
            onChange={(e) => setUseContext(e.target.checked)}
            className="accent-[var(--primary)]"
          />
          <Wand2 className="h-3 w-3 text-primary" />
          Send the open file as context
        </label>
      </form>
    </div>
  );
}

export default AIAssistant;
