import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { PREVIEW_KEY } from "@/lib/jaycode";

export const Route = createFileRoute("/preview")({
  head: () => ({
    meta: [
      { title: "Live preview — JayCode by JayTech" },
      {
        name: "description",
        content: "Full-page live preview of the HTML, CSS and JavaScript you wrote in JayCode.",
      },
      { property: "og:title", content: "Live preview — JayCode by JayTech" },
      {
        property: "og:description",
        content: "Full-page live preview of your JayCode project, rendered in its own tab.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PreviewPage,
});

function PreviewPage() {
  const [doc, setDoc] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      try {
        setDoc(localStorage.getItem(PREVIEW_KEY) ?? "");
      } catch {
        setDoc("");
      }
    };
    read();
    window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, []);

  if (doc === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading preview…
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 bg-background px-6 text-center">
        <p className="text-lg font-semibold text-foreground">Nothing to preview yet</p>
        <p className="text-sm text-muted-foreground">
          Open JayCode, run your project, then use “Open in new tab”.
        </p>
        <a href="/" className="mt-2 text-sm font-semibold text-primary hover:underline">
          Back to JayCode
        </a>
      </div>
    );
  }

  return (
    <iframe
      title="JayCode live preview"
      srcDoc={doc}
      sandbox="allow-scripts allow-modals allow-forms allow-popups"
      className="h-screen w-screen border-0 bg-white"
    />
  );
}
