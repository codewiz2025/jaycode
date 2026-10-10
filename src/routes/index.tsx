import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";

import { JayBadge } from "@/components/JayBadge";
import { AuthGate } from "@/components/AuthGate";
import { JayCodeIDE } from "@/components/JayCodeIDE";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "JayCode — Online IDE by JayTech" },
      {
        name: "description",
        content:
          "Sign in to JayCode, JayTech's cloud-synced browser IDE for HTML, CSS, JavaScript and Python with live preview, a Python terminal and AI assistance.",
      },
      { property: "og:title", content: "JayCode — Online IDE by JayTech" },
      {
        property: "og:description",
        content:
          "Sign in to code in the browser and keep your JayCode projects and files saved securely in the cloud.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <>
      <h1 className="sr-only">JayCode — the online IDE by JayTech</h1>
      <ClientOnly fallback={<IDEFallback />}>
        <AuthGate>
          {(user, signOut) => <JayCodeIDE key={user.id} user={user} onSignOut={signOut} />}
        </AuthGate>
      </ClientOnly>
      <JayBadge />
    </>
  );
}

function IDEFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      Loading JayCode…
    </div>
  );
}
