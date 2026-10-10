export type FileKind = "html" | "css" | "javascript" | "python" | "json" | "markdown" | "plaintext";

export interface JayFile {
  id: string;
  name: string;
  language: FileKind;
  content: string;
}

export const STORAGE_KEY = "jaycode.project.v1";
export const PREVIEW_KEY = "jaycode.preview.v1";
export const PROJECT_NAME_KEY = "jaycode.projectName.v1";

export const DEFAULT_PROJECT_NAME = "jaycode-project";

export function slugify(name: string) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || DEFAULT_PROJECT_NAME
  );
}

const BINARY_EXT = new Set([
  "png","jpg","jpeg","gif","webp","ico","bmp","pdf","zip","gz","tar","rar","7z",
  "mp3","mp4","mov","avi","wav","ogg","woff","woff2","ttf","otf","eot","exe","dll","so","class","pyc",
]);

/** Should this uploaded file be imported as editable text? */
export function isTextFile(path: string, size: number) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (BINARY_EXT.has(ext)) return false;
  if (size > 1024 * 1024) return false;
  if (/(^|\/)(node_modules|\.git|dist|build|\.next|__pycache__|\.venv|venv)\//.test(path)) return false;
  return true;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function languageFor(name: string): FileKind {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "html":
    case "htm":
      return "html";
    case "css":
      return "css";
    case "js":
    case "mjs":
    case "jsx":
      return "javascript";
    case "py":
      return "python";
    case "json":
      return "json";
    case "md":
      return "markdown";
    default:
      return "plaintext";
  }
}

export function starterFiles(): JayFile[] {
  return [
    {
      id: uid(),
      name: "index.html",
      language: "html",
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>JayCode Sandbox</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <main class="card">
      <h1>Hello from <span>JayCode</span></h1>
      <p>Edit the files on the left, hit Run, and watch this update live.</p>
      <button id="ping">Ping the terminal</button>
    </main>
    <script src="main.js"></script>
  </body>
</html>
`,
    },
    {
      id: uid(),
      name: "style.css",
      language: "css",
      content: `:root { color-scheme: dark; }
body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: radial-gradient(circle at 50% 0%, #10254d, #05060a 65%);
  font-family: ui-sans-serif, system-ui, sans-serif;
  color: #e8f0ff;
}
.card {
  padding: 40px 44px;
  border-radius: 20px;
  border: 1px solid rgba(64, 149, 255, 0.45);
  background: rgba(8, 12, 22, 0.85);
  box-shadow: 0 0 60px rgba(47, 123, 255, 0.35);
  text-align: center;
}
h1 { margin: 0 0 8px; font-size: 30px; }
h1 span { color: #35a2ff; text-shadow: 0 0 18px rgba(53, 162, 255, 0.8); }
p { margin: 0 0 20px; color: #93a6c8; }
button {
  border: 1px solid #2f7bff;
  background: linear-gradient(180deg, #1d63e0, #1146ab);
  color: white;
  padding: 10px 18px;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 600;
}
`,
    },
    {
      id: uid(),
      name: "main.js",
      language: "javascript",
      content: `console.log("JayCode preview booted ⚡");

document.getElementById("ping")?.addEventListener("click", () => {
  console.log("Ping from the preview at", new Date().toLocaleTimeString());
});
`,
    },
    {
      id: uid(),
      name: "main.py",
      language: "python",
      content: `# Python runs in your browser via Pyodide.
# Press Run (Ctrl+Enter) with this file open.

def fib(n):
    a, b = 0, 1
    for _ in range(n):
        yield a
        a, b = b, a + b

print("JayCode Python terminal ready")
print("First 10 Fibonacci numbers:", list(fib(10)))
`,
    },
  ];
}

/** Compose the html/css/js files into a single standalone document. */
export function buildPreviewDocument(files: JayFile[]): string {
  const html =
    files.find((f) => f.name.toLowerCase() === "index.html")?.content ??
    files.find((f) => f.language === "html")?.content ??
    "<!doctype html><html><body></body></html>";

  const css = files.filter((f) => f.language === "css");
  const js = files.filter((f) => f.language === "javascript");

  let out = html;

  for (const file of css) {
    const tag = new RegExp(
      `<link[^>]*href=["']\\.?/?${escapeRe(file.name)}["'][^>]*>`,
      "gi",
    );
    const style = `<style data-jaycode="${file.name}">\n${file.content}\n</style>`;
    if (tag.test(out)) out = out.replace(tag, style);
    else out = injectBefore(out, "</head>", style);
  }

  for (const file of js) {
    const tag = new RegExp(
      `<script[^>]*src=["']\\.?/?${escapeRe(file.name)}["'][^>]*>\\s*</script>`,
      "gi",
    );
    const script = `<script data-jaycode="${file.name}">\n${file.content}\n</script>`;
    if (tag.test(out)) out = out.replace(tag, script);
    else out = injectBefore(out, "</body>", script);
  }

  return injectBefore(out, "</head>", CONSOLE_BRIDGE);
}

const CONSOLE_BRIDGE = `<script>
(function () {
  var send = function (level, args) {
    try {
      parent.postMessage({ source: "jaycode-preview", level: level, message: Array.prototype.map.call(args, function (a) {
        if (typeof a === "string") return a;
        try { return JSON.stringify(a); } catch (e) { return String(a); }
      }).join(" ") }, "*");
    } catch (e) {}
  };
  ["log", "info", "warn", "error"].forEach(function (level) {
    var original = console[level].bind(console);
    console[level] = function () { send(level, arguments); original.apply(console, arguments); };
  });
  window.addEventListener("error", function (e) { send("error", [e.message]); });
  window.addEventListener("unhandledrejection", function (e) { send("error", [String(e.reason)]); });
})();
</script>`;

function injectBefore(doc: string, marker: string, snippet: string) {
  const idx = doc.toLowerCase().lastIndexOf(marker);
  if (idx === -1) return doc + snippet;
  return doc.slice(0, idx) + snippet + "\n" + doc.slice(idx);
}

function escapeRe(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
