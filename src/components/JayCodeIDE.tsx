import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@netlify/identity";
import {
  ChevronRight,
  Cloud,
  CloudOff,
  Download,
  ExternalLink,
  FileCode2,
  FileJson,
  FileText,
  FileType2,
  FolderDown,
  FolderUp,
  Loader2,
  LogOut,
  Pencil,
  Play,
  Plus,
  RotateCw,
  Search,
  Sparkles,
  Square,
  Trash2,
  TerminalSquare,
  X,
} from "lucide-react";

import jaytech from "@/assets/jaytech.png";
import { InstallButton } from "@/components/InstallButton";
import type { CloudProject, SaveCloudProject } from "@/lib/cloud-project";
import {
  buildPreviewDocument,
  DEFAULT_PROJECT_NAME,
  isTextFile,
  languageFor,
  PREVIEW_KEY,
  PROJECT_NAME_KEY,
  slugify,
  starterFiles,
  STORAGE_KEY,
  uid,
  type JayFile,
} from "@/lib/jaycode";

const CodeEditor = lazy(() => import("@/components/CodeEditor"));
const AIAssistant = lazy(() => import("@/components/AIAssistant"));

type LogLevel = "log" | "error" | "warn" | "info" | "input" | "system";
interface LogLine {
  id: string;
  level: LogLevel;
  text: string;
}

type PyStatus = "idle" | "loading" | "ready" | "running" | "error";

const iconFor = (file: JayFile) => {
  switch (file.language) {
    case "html":
      return FileType2;
    case "css":
      return FileText;
    case "python":
      return FileCode2;
    case "json":
      return FileJson;
    default:
      return FileCode2;
  }
};

const colorFor = (file: JayFile) => {
  switch (file.language) {
    case "html":
      return "text-orange-400";
    case "css":
      return "text-sky-400";
    case "javascript":
      return "text-yellow-300";
    case "python":
      return "text-emerald-400";
    default:
      return "text-muted-foreground";
  }
};

interface JayCodeIDEProps {
  user: User;
  onSignOut: () => Promise<void>;
}

type SaveStatus = "loading" | "saving" | "saved" | "error";

export function JayCodeIDE({ user, onSignOut }: JayCodeIDEProps) {
  const [files, setFiles] = useState<JayFile[]>(() => starterFiles());
  const [activeId, setActiveId] = useState<string>("");
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [logs, setLogs] = useState<LogLine[]>([
    { id: uid(), level: "system", text: "JayCode terminal — Python (Pyodide) boots on first run." },
  ]);
  const [command, setCommand] = useState("");
  const [preview, setPreview] = useState("");
  const [pyStatus, setPyStatus] = useState<PyStatus>("idle");
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [sidebarWidth, setSidebarWidth] = useState(230);
  const [previewWidth, setPreviewWidth] = useState(420);
  const [panelHeight, setPanelHeight] = useState(220);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [autoRun, setAutoRun] = useState(true);
  const [rightPanel, setRightPanel] = useState<"preview" | "ai">("preview");
  const [hydrated, setHydrated] = useState(false);
  const [projectName, setProjectName] = useState(DEFAULT_PROJECT_NAME);
  const [importing, setImporting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("loading");

  const workerRef = useRef<Worker | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const filesRef = useRef(files);
  filesRef.current = files;

  const activeFile = files.find((f) => f.id === activeId) ?? files[0];

  const pushLog = useCallback((level: LogLevel, text: string) => {
    setLogs((prev) => [...prev.slice(-400), { id: uid(), level, text }]);
  }, []);

  /* ---------- persistence ---------- */
  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const response = await fetch("/api/project", { headers: { accept: "application/json" } });
        if (response.status === 401) {
          await onSignOut().catch(() => undefined);
          return;
        }
        if (!response.ok) throw new Error("Cloud workspace could not be loaded");

        const project = (await response.json()) as CloudProject | null;
        let nextFiles = project?.files;
        let nextName = project?.name;

        if (!nextFiles?.length) {
          try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const legacyFiles = raw ? (JSON.parse(raw) as JayFile[]) : [];
            if (Array.isArray(legacyFiles) && legacyFiles.length) nextFiles = legacyFiles;
            nextName = localStorage.getItem(PROJECT_NAME_KEY) || DEFAULT_PROJECT_NAME;
          } catch {
            nextFiles = undefined;
          }
        }

        const resolvedFiles = nextFiles?.length ? nextFiles : starterFiles();
        if (!active) return;
        setFiles(resolvedFiles);
        setProjectName(nextName || DEFAULT_PROJECT_NAME);
        setActiveId(resolvedFiles[0]?.id ?? "");
        setOpenTabs(resolvedFiles.slice(0, 4).map((file) => file.id));
        setSaveStatus(project ? "saved" : "saving");
      } catch {
        if (!active) return;
        const fallbackFiles = starterFiles();
        setFiles(fallbackFiles);
        setActiveId(fallbackFiles[0]?.id ?? "");
        setOpenTabs(fallbackFiles.map((file) => file.id));
        setSaveStatus("error");
      } finally {
        if (active) setHydrated(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [onSignOut]);

  useEffect(() => {
    if (!hydrated) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSaveStatus("saving");
      const payload: SaveCloudProject = { name: projectName, files };
      void fetch("/api/project", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (response.status === 401) {
            await onSignOut().catch(() => undefined);
            return;
          }
          if (!response.ok) throw new Error("Cloud save failed");
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(PROJECT_NAME_KEY);
          setSaveStatus("saved");
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setSaveStatus("error");
        });
    }, 700);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [files, hydrated, onSignOut, projectName]);

  /* ---------- preview ---------- */
  const refreshPreview = useCallback(() => {
    const doc = buildPreviewDocument(filesRef.current);
    setPreview(doc);
    try {
      localStorage.setItem(PREVIEW_KEY, doc);
    } catch {
      /* quota */
    }
  }, []);

  useEffect(() => {
    if (!autoRun) return;
    const timer = setTimeout(refreshPreview, 500);
    return () => clearTimeout(timer);
  }, [files, autoRun, refreshPreview]);

  useEffect(() => {
    refreshPreview();
  }, [refreshPreview]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.source !== "jaycode-preview") return;
      pushLog(event.data.level as LogLevel, `[preview] ${event.data.message}`);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [pushLog]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [logs]);

  /* ---------- python worker ---------- */
  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker(new URL("../workers/python.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent) => {
      const data = event.data as { type: string; text?: string; status?: PyStatus };
      if (data.type === "stdout" && data.text) pushLog("log", data.text.replace(/\n$/, ""));
      if (data.type === "stderr" && data.text) pushLog("error", data.text.replace(/\n$/, ""));
      if (data.type === "status") {
        if (data.status === "loading") {
          setPyStatus("loading");
          pushLog("system", "Downloading Python runtime (Pyodide)…");
        }
        if (data.status === "ready") {
          setPyStatus("ready");
          pushLog("system", "Python runtime ready.");
        }
        if (data.status === "error") {
          setPyStatus("error");
          pushLog("error", data.text ?? "Python runtime failed to load");
        }
      }
      if (data.type === "done") setPyStatus("ready");
    };
    workerRef.current = worker;
    worker.postMessage({ type: "boot" });
    return worker;
  }, [pushLog]);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const runPython = useCallback(
    (code: string) => {
      if (!code.trim()) return;
      const worker = ensureWorker();
      setPyStatus("running");
      worker.postMessage({ type: "run", code });
    },
    [ensureWorker],
  );

  const stopPython = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setPyStatus("idle");
    pushLog("system", "Python execution stopped.");
  }, [pushLog]);

  /* ---------- actions ---------- */
  const run = useCallback(() => {
    if (activeFile?.language === "python") {
      pushLog("system", `▶ Running ${activeFile.name}`);
      runPython(activeFile.content);
    } else {
      refreshPreview();
      pushLog("system", "▶ Preview rebuilt");
    }
  }, [activeFile, pushLog, refreshPreview, runPython]);

  const openInNewTab = useCallback(() => {
    refreshPreview();
    window.open("/preview", "_blank", "noopener");
  }, [refreshPreview]);

  const updateActive = (content: string) => {
    setFiles((prev) => prev.map((f) => (f.id === activeFile?.id ? { ...f, content } : f)));
  };

  const openFile = (id: string) => {
    setActiveId(id);
    setOpenTabs((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const closeTab = (id: string) => {
    setOpenTabs((prev) => {
      const next = prev.filter((t) => t !== id);
      if (id === activeId) setActiveId(next[next.length - 1] ?? "");
      return next;
    });
  };

  const addFile = () => {
    const name = window.prompt("New file name (e.g. utils.py)");
    if (!name) return;
    const file: JayFile = { id: uid(), name, language: languageFor(name), content: "" };
    setFiles((prev) => [...prev, file]);
    openFile(file.id);
  };

  const renameFile = (file: JayFile) => {
    const name = window.prompt("Rename file", file.name);
    if (!name) return;
    setFiles((prev) =>
      prev.map((f) => (f.id === file.id ? { ...f, name, language: languageFor(name) } : f)),
    );
  };

  const deleteFile = (file: JayFile) => {
    if (!window.confirm(`Delete ${file.name}?`)) return;
    setFiles((prev) => prev.filter((f) => f.id !== file.id));
    closeTab(file.id);
  };

  const downloadFile = (file: JayFile) => {
    const url = URL.createObjectURL(new Blob([file.content], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadProject = async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    files.forEach((f) => zip.file(f.name, f.content));
    const blob = await zip.generateAsync({ type: "blob" });
    const fileName = `${slugify(projectName)}.zip`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    pushLog("system", `Project downloaded as ${fileName}`);
  };

  const renameProject = () => {
    const name = window.prompt("Rename project", projectName);
    if (!name?.trim()) return;
    setProjectName(name.trim());
    pushLog("system", `Project renamed to ${name.trim()}`);
  };

  const mergeIncoming = (incoming: JayFile[], replace: boolean) => {
    if (!incoming.length) {
      pushLog("error", "No readable text files were found in that upload.");
      return;
    }
    setFiles((prev) => {
      if (replace) return incoming;
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...incoming.filter((f) => !names.has(f.name))];
    });
    if (replace) setOpenTabs([]);
    const first = incoming.find((f) => /index\.html$/i.test(f.name)) ?? incoming[0];
    if (first) openFile(first.id);
    pushLog("system", `Imported ${incoming.length} file(s).`);
  };

  const uploadFiles = async (list: FileList | null, asFolder = false) => {
    if (!list?.length) return;
    setImporting(true);
    try {
      const all = Array.from(list);
      // Single .zip archive → unpack it as a project.
      if (!asFolder && all.length === 1 && /\.zip$/i.test(all[0]!.name)) {
        await importZip(all[0]!);
        return;
      }

      let root = "";
      if (asFolder) {
        const firstPath =
          (all[0] as File & { webkitRelativePath?: string }).webkitRelativePath ?? "";
        root = firstPath.split("/")[0] ?? "";
      }

      const incoming: JayFile[] = [];
      for (const file of all) {
        const rel =
          (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        if (!isTextFile(rel, file.size)) continue;
        const name = root && rel.startsWith(`${root}/`) ? rel.slice(root.length + 1) : rel;
        incoming.push({
          id: uid(),
          name,
          language: languageFor(name),
          content: await file.text(),
        });
      }

      if (asFolder && root) setProjectName(root);
      mergeIncoming(incoming, asFolder);
    } catch (error) {
      pushLog("error", `Import failed: ${String(error)}`);
    } finally {
      setImporting(false);
    }
  };

  const importZip = async (archive: File) => {
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(archive);
    const entries = Object.values(zip.files).filter((e) => !e.dir);
    const paths = entries.map((e) => e.name);
    const topLevels = new Set(paths.map((p) => p.split("/")[0]));
    const root =
      topLevels.size === 1 && paths.every((p) => p.includes("/")) ? [...topLevels][0]! : "";

    const incoming: JayFile[] = [];
    for (const entry of entries) {
      const rel = entry.name;
      if (!isTextFile(rel, 0)) continue;
      const name = root && rel.startsWith(`${root}/`) ? rel.slice(root.length + 1) : rel;
      if (!name) continue;
      incoming.push({
        id: uid(),
        name,
        language: languageFor(name),
        content: await entry.async("string"),
      });
    }
    setProjectName(root || archive.name.replace(/\.zip$/i, ""));
    mergeIncoming(incoming, true);
  };

  const submitCommand = (event: React.FormEvent) => {
    event.preventDefault();
    const value = command.trim();
    if (!value) return;
    setCommand("");
    pushLog("input", `>>> ${value}`);
    if (value === "clear") {
      setLogs([]);
      return;
    }
    if (pyStatus === "running") {
      workerRef.current?.postMessage({ type: "stdin", text: value });
      return;
    }
    runPython(value);
  };

  /* ---------- shortcuts ---------- */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (meta && event.key === "Enter") {
        event.preventDefault();
        run();
      }
      if (meta && event.key.toLowerCase() === "s") {
        event.preventDefault();
        refreshPreview();
        pushLog("system", "Saved to this browser.");
      }
      if (event.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, refreshPreview, pushLog]);

  /* ---------- resizing ---------- */
  const startDrag =
    (axis: "x" | "y", apply: (delta: number) => void) => (event: React.MouseEvent) => {
      event.preventDefault();
      const start = axis === "x" ? event.clientX : event.clientY;
      const move = (e: MouseEvent) => apply((axis === "x" ? e.clientX : e.clientY) - start);
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    };

  const commands = useMemo(
    () => [
      { label: "Run current file", action: run },
      { label: "Open preview in new tab", action: openInNewTab },
      { label: "New file", action: addFile },
      { label: "Rename project", action: renameProject },
      { label: "Download project (.zip)", action: () => void downloadProject() },
      { label: "Clear terminal", action: () => setLogs([]) },
      {
        label: autoRun ? "Disable live preview" : "Enable live preview",
        action: () => setAutoRun((v) => !v),
      },
      ...files.map((f) => ({ label: `Open ${f.name}`, action: () => openFile(f.id) })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [files, autoRun, run, openInNewTab, projectName],
  );

  const filteredCommands = commands.filter((c) =>
    c.label.toLowerCase().includes(paletteQuery.toLowerCase()),
  );

  const tabs = openTabs
    .map((id) => files.find((f) => f.id === id))
    .filter((f): f is JayFile => Boolean(f));

  if (!hydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" /> Loading cloud workspace…
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
      {/* Title bar */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-[oklch(0.16_0.03_255)] px-3">
        <div className="flex items-center gap-2">
          <img
            src={jaytech}
            alt="JayCode"
            className="h-7 w-7 rounded-md border border-primary/60 object-cover shadow-[0_0_14px_rgba(47,123,255,0.55)]"
          />
          <span className="text-sm font-semibold tracking-wide">
            Jay
            <span className="text-primary drop-shadow-[0_0_10px_rgba(47,123,255,0.9)]">Code</span>
          </span>
        </div>

        <button
          onClick={renameProject}
          title="Rename project"
          className="group flex items-center gap-1.5 rounded-md border border-border/70 px-2 py-1 text-xs text-muted-foreground hover:border-primary/60 hover:text-primary"
        >
          <span className="max-w-[160px] truncate font-medium">{projectName}</span>
          <Pencil className="h-3 w-3 opacity-60 group-hover:opacity-100" />
        </button>

        <div className="ml-2 hidden items-center gap-1 text-xs text-muted-foreground md:flex">
          <button className="rounded px-2 py-1 hover:bg-secondary" onClick={addFile}>
            File
          </button>
          <label className="cursor-pointer rounded px-2 py-1 hover:bg-secondary">
            Upload files
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                void uploadFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <label className="flex cursor-pointer items-center gap-1 rounded px-2 py-1 hover:bg-secondary">
            {importing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <FolderUp className="h-3 w-3" />
            )}
            Upload folder
            <input
              type="file"
              multiple
              className="hidden"
              // @ts-expect-error non-standard but widely supported directory picker
              webkitdirectory=""
              directory=""
              onChange={(e) => {
                void uploadFiles(e.target.files, true);
                e.target.value = "";
              }}
            />
          </label>
          <button
            className="rounded px-2 py-1 hover:bg-secondary"
            onClick={() => setAutoRun((v) => !v)}
          >
            Live preview: {autoRun ? "on" : "off"}
          </button>
          <button
            className="rounded px-2 py-1 hover:bg-secondary"
            onClick={() => setPaletteOpen(true)}
          >
            Commands ⌘K
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div
            className={`hidden items-center gap-1.5 text-[11px] lg:flex ${saveStatus === "error" ? "text-destructive" : "text-muted-foreground"}`}
            title={
              saveStatus === "error"
                ? "Cloud save failed. Changes save again with your next edit."
                : "Project files are saved to your cloud workspace."
            }
          >
            {saveStatus === "saving" || saveStatus === "loading" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : saveStatus === "error" ? (
              <CloudOff className="h-3.5 w-3.5" />
            ) : (
              <Cloud className="h-3.5 w-3.5 text-primary" />
            )}
            {saveStatus === "saving" || saveStatus === "loading"
              ? "Saving…"
              : saveStatus === "error"
                ? "Cloud offline"
                : "Saved to cloud"}
          </div>
          <button
            onClick={run}
            className="flex items-center gap-1.5 rounded-md border border-primary/70 bg-gradient-to-b from-primary to-[oklch(0.45_0.19_260)] px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-[0_0_18px_rgba(47,123,255,0.5)] transition hover:brightness-110"
          >
            <Play className="h-3.5 w-3.5" /> Run
          </button>
          {pyStatus === "running" && (
            <button
              onClick={stopPython}
              className="flex items-center gap-1.5 rounded-md border border-destructive/60 px-3 py-1.5 text-xs font-semibold text-destructive"
            >
              <Square className="h-3.5 w-3.5" /> Stop
            </button>
          )}
          <button
            onClick={openInNewTab}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:border-primary/60 hover:text-primary"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open in new tab
          </button>
          <button
            onClick={() => void downloadProject()}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:border-primary/60 hover:text-primary"
          >
            <FolderDown className="h-3.5 w-3.5" /> .zip
          </button>
          <InstallButton />
          <div
            className="hidden max-w-36 truncate border-l border-border pl-2 text-[11px] text-muted-foreground xl:block"
            title={user.email}
          >
            {user.email ?? user.name ?? "Signed in"}
          </div>
          <button
            onClick={() => void onSignOut()}
            title="Sign out"
            className="rounded-md border border-border p-1.5 text-muted-foreground hover:border-primary/60 hover:text-primary"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Explorer */}
        <aside
          className="flex shrink-0 flex-col border-r border-border bg-[oklch(0.14_0.025_255)]"
          style={{ width: sidebarWidth }}
        >
          <div className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            <span>Explorer</span>
            <button onClick={addFile} title="New file" className="rounded p-1 hover:bg-secondary">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-1 px-3 pb-1 text-[11px] text-muted-foreground">
            <ChevronRight className="h-3 w-3" />
            <button
              onClick={renameProject}
              className="truncate hover:text-primary"
              title="Rename project"
            >
              {projectName}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
            {files.map((file) => {
              const Icon = iconFor(file);
              return (
                <div
                  key={file.id}
                  className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
                    file.id === activeFile?.id
                      ? "bg-primary/15 text-foreground shadow-[inset_2px_0_0_0_var(--primary)]"
                      : "text-muted-foreground hover:bg-secondary/60"
                  }`}
                >
                  <button
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => openFile(file.id)}
                    onDoubleClick={() => renameFile(file)}
                  >
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${colorFor(file)}`} />
                    <span className="truncate">{file.name}</span>
                  </button>
                  <button
                    className="hidden text-muted-foreground hover:text-primary group-hover:block"
                    title="Download file"
                    onClick={() => downloadFile(file)}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="hidden text-muted-foreground hover:text-destructive group-hover:block"
                    title="Delete file"
                    onClick={() => deleteFile(file)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </aside>

        <div
          onMouseDown={startDrag("x", (d) =>
            setSidebarWidth((w) => Math.min(420, Math.max(160, w + d / 1))),
          )}
          className="w-1 cursor-col-resize bg-transparent hover:bg-primary/40"
        />

        {/* Editor + terminal */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-9 shrink-0 items-center gap-px overflow-x-auto border-b border-border bg-[oklch(0.13_0.02_255)]">
            {tabs.map((file) => (
              <div
                key={file.id}
                className={`flex h-full items-center gap-2 border-r border-border px-3 text-xs ${
                  file.id === activeFile?.id
                    ? "border-t-2 border-t-primary bg-background text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <button onClick={() => setActiveId(file.id)}>{file.name}</button>
                <button onClick={() => closeTab(file.id)} className="hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          <div className="min-h-0 flex-1">
            {activeFile ? (
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading editor…
                  </div>
                }
              >
                <CodeEditor
                  language={activeFile.language}
                  value={activeFile.content}
                  onChange={updateActive}
                  onCursor={setCursor}
                  onRun={run}
                />
              </Suspense>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Open a file to start coding
              </div>
            )}
          </div>

          <div
            onMouseDown={startDrag("y", (d) =>
              setPanelHeight((h) => Math.min(520, Math.max(120, h - d))),
            )}
            className="h-1 cursor-row-resize hover:bg-primary/40"
          />

          {/* Terminal */}
          <section
            className="flex shrink-0 flex-col border-t border-border bg-[oklch(0.11_0.02_255)]"
            style={{ height: panelHeight }}
          >
            <div className="flex items-center gap-3 border-b border-border px-3 py-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
              <span className="flex items-center gap-1.5 text-primary">
                <TerminalSquare className="h-3.5 w-3.5" /> Terminal
              </span>
              <span className="ml-auto normal-case tracking-normal">
                {pyStatus === "loading" && "Booting Pyodide…"}
                {pyStatus === "running" && "Running…"}
                {pyStatus === "ready" && "Python ready"}
                {pyStatus === "idle" && "Python idle"}
                {pyStatus === "error" && "Python error"}
              </span>
              <button onClick={() => setLogs([])} className="normal-case hover:text-primary">
                Clear
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-[12.5px] leading-relaxed">
              {logs.map((line) => (
                <pre
                  key={line.id}
                  className={`whitespace-pre-wrap break-words ${
                    line.level === "error"
                      ? "text-destructive"
                      : line.level === "warn"
                        ? "text-yellow-400"
                        : line.level === "system"
                          ? "text-muted-foreground"
                          : line.level === "input"
                            ? "text-primary"
                            : "text-foreground"
                  }`}
                >
                  {line.text}
                </pre>
              ))}
              <div ref={logEndRef} />
            </div>
            <form
              onSubmit={submitCommand}
              className="flex items-center gap-2 border-t border-border px-3 py-2"
            >
              <span className="font-mono text-xs text-primary">{">>>"}</span>
              <input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="Run a Python expression, send input(), or type clear"
                className="flex-1 bg-transparent font-mono text-xs outline-none placeholder:text-muted-foreground/70"
              />
            </form>
          </section>
        </div>

        <div
          onMouseDown={startDrag("x", (d) =>
            setPreviewWidth((w) => Math.min(900, Math.max(240, w - d))),
          )}
          className="w-1 cursor-col-resize hover:bg-primary/40"
        />

        {/* Preview / AI Assistant */}
        <aside
          className="flex shrink-0 flex-col border-l border-border bg-[oklch(0.13_0.02_255)]"
          style={{ width: previewWidth }}
        >
          <div className="flex items-center gap-1 border-b border-border px-2 py-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
            <button
              onClick={() => setRightPanel("preview")}
              className={`flex items-center gap-1.5 rounded px-2 py-1 ${
                rightPanel === "preview"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ExternalLink className="h-3.5 w-3.5" /> Preview
            </button>
            <button
              onClick={() => setRightPanel("ai")}
              className={`flex items-center gap-1.5 rounded px-2 py-1 ${
                rightPanel === "ai"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" /> AI
            </button>
            {rightPanel === "preview" && (
              <div className="ml-auto flex items-center gap-1">
                <button onClick={refreshPreview} className="hover:text-primary" title="Refresh">
                  <RotateCw className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={openInNewTab}
                  className="hover:text-primary"
                  title="Open in new tab"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {rightPanel === "preview" ? (
            <iframe
              title="JayCode preview"
              srcDoc={preview}
              sandbox="allow-scripts allow-modals allow-forms allow-popups"
              className="min-h-0 flex-1 bg-white"
            />
          ) : (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading assistant…
                </div>
              }
            >
              <AIAssistant
                fileName={activeFile?.name}
                fileLanguage={activeFile?.language}
                fileContent={activeFile?.content}
              />
            </Suspense>
          )}
        </aside>
      </div>

      {/* Status bar */}
      <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-border bg-[oklch(0.16_0.03_255)] px-3 text-[11px] text-muted-foreground">
        <span className="text-primary">JayCode</span>
        <span>
          Ln {cursor.line}, Col {cursor.column}
        </span>
        <span className="capitalize">{activeFile?.language ?? "—"}</span>
        <span>{files.length} files</span>
        <span className="ml-auto pr-40">Saved locally · Ctrl+Enter to run · Ctrl+K commands</span>
      </footer>

      {/* Command palette */}
      {paletteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-28"
          onClick={() => setPaletteOpen(false)}
        >
          <div
            className="w-[520px] overflow-hidden rounded-xl border border-primary/40 bg-[oklch(0.14_0.025_255)] shadow-[0_0_50px_rgba(47,123,255,0.35)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
              <Search className="h-4 w-4 text-primary" />
              <input
                autoFocus
                value={paletteQuery}
                onChange={(e) => setPaletteQuery(e.target.value)}
                placeholder="Type a command…"
                className="flex-1 bg-transparent text-sm outline-none"
              />
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {filteredCommands.map((c) => (
                <button
                  key={c.label}
                  onClick={() => {
                    setPaletteOpen(false);
                    setPaletteQuery("");
                    c.action();
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-muted-foreground hover:bg-primary/15 hover:text-foreground"
                >
                  {c.label}
                </button>
              ))}
              {!filteredCommands.length && (
                <p className="px-4 py-3 text-sm text-muted-foreground">No matching command</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
