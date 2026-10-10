import Editor, { type OnMount } from "@monaco-editor/react";

const THEME = {
  base: "vs-dark" as const,
  inherit: true,
  rules: [
    { token: "comment", foreground: "4c5b78", fontStyle: "italic" },
    { token: "keyword", foreground: "4aa3ff" },
    { token: "string", foreground: "5fd3ff" },
    { token: "number", foreground: "8ab6ff" },
    { token: "type", foreground: "76e0ff" },
    { token: "tag", foreground: "4aa3ff" },
    { token: "attribute.name", foreground: "7fb6ff" },
  ],
  colors: {
    "editor.background": "#08090d",
    "editor.foreground": "#dfe8ff",
    "editorLineNumber.foreground": "#2c3a55",
    "editorLineNumber.activeForeground": "#4aa3ff",
    "editorCursor.foreground": "#4aa3ff",
    "editor.selectionBackground": "#1d3f77",
    "editor.lineHighlightBackground": "#0e1420",
    "editorIndentGuide.background1": "#141c2b",
    "editorWidget.background": "#0b1018",
    "editorGutter.background": "#08090d",
    "minimap.background": "#08090d",
    "scrollbarSlider.background": "#16233a",
  },
};

interface Props {
  language: string;
  value: string;
  onChange: (value: string) => void;
  onCursor?: (position: { line: number; column: number }) => void;
  onRun?: () => void;
}

export default function CodeEditor({ language, value, onChange, onCursor, onRun }: Props) {
  const handleMount: OnMount = (editor, monaco) => {
    monaco.editor.defineTheme("jaycode", THEME);
    monaco.editor.setTheme("jaycode");
    editor.onDidChangeCursorPosition((e) =>
      onCursor?.({ line: e.position.lineNumber, column: e.position.column }),
    );
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onRun?.());
  };

  return (
    <Editor
      language={language}
      value={value}
      theme="jaycode"
      onMount={handleMount}
      onChange={(next) => onChange(next ?? "")}
      loading={<span className="text-xs text-muted-foreground">Loading editor…</span>}
      options={{
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: 13.5,
        fontLigatures: true,
        minimap: { enabled: true, size: "fit" },
        smoothScrolling: true,
        cursorBlinking: "smooth",
        cursorSmoothCaretAnimation: "on",
        padding: { top: 14, bottom: 24 },
        scrollBeyondLastLine: false,
        renderLineHighlight: "all",
        tabSize: 2,
        automaticLayout: true,
        bracketPairColorization: { enabled: true },
      }}
    />
  );
}
