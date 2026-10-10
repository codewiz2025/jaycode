/// <reference lib="webworker" />
// Pyodide-powered Python runtime. Loaded lazily from the CDN inside a worker
// so long-running user code never blocks the JayCode UI.

const PYODIDE_VERSION = "0.28.3";
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.mjs`;

type Pyodide = {
  runPythonAsync: (code: string) => Promise<unknown>;
  setStdout: (opts: { batched: (s: string) => void }) => void;
  setStderr: (opts: { batched: (s: string) => void }) => void;
  setStdin: (opts: { stdin: () => string }) => void;
  loadPackagesFromImports: (code: string) => Promise<void>;
};

let pyodide: Pyodide | null = null;
let booting: Promise<Pyodide> | null = null;
const stdinQueue: string[] = [];

const post = (message: Record<string, unknown>) => self.postMessage(message);

async function boot(): Promise<Pyodide> {
  if (pyodide) return pyodide;
  if (booting) return booting;

  booting = (async () => {
    post({ type: "status", status: "loading" });
    const mod = await import(/* @vite-ignore */ PYODIDE_URL);
    const py: Pyodide = await mod.loadPyodide({
      indexURL: `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`,
    });
    py.setStdout({ batched: (text: string) => post({ type: "stdout", text }) });
    py.setStderr({ batched: (text: string) => post({ type: "stderr", text }) });
    py.setStdin({
      stdin: () => {
        const line = stdinQueue.shift();
        if (line === undefined) {
          post({
            type: "stderr",
            text: "[JayCode] input() had no queued value — type a line in the terminal before running.",
          });
          return "";
        }
        post({ type: "stdout", text: line });
        return line;
      },
    });
    pyodide = py;
    post({ type: "status", status: "ready" });
    return py;
  })();

  return booting;
}

self.onmessage = async (event: MessageEvent) => {
  const data = event.data as { type: string; code?: string; text?: string; runId?: number };

  if (data.type === "boot") {
    await boot().catch((error) =>
      post({ type: "status", status: "error", text: String(error) }),
    );
    return;
  }

  if (data.type === "stdin") {
    if (typeof data.text === "string") stdinQueue.push(data.text);
    return;
  }

  if (data.type === "run" && data.code !== undefined) {
    try {
      const py = await boot();
      await py.loadPackagesFromImports(data.code).catch(() => undefined);
      const result = await py.runPythonAsync(data.code);
      if (result !== undefined && result !== null) {
        post({ type: "stdout", text: String(result) });
      }
      post({ type: "done", runId: data.runId });
    } catch (error) {
      post({ type: "stderr", text: String((error as Error)?.message ?? error) });
      post({ type: "done", runId: data.runId, failed: true });
    }
  }
};
