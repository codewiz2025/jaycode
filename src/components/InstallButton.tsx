import { Download, Share } from "lucide-react";
import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let pwaStarted = false;

/**
 * Registers the service worker and captures the browser's install prompt as early as
 * possible (the event fires once, often before any button is on screen).
 */
export function initPwa() {
  if (typeof window === "undefined" || pwaStarted) return;
  pwaStarted = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event("jc-pwa-change"));
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    window.dispatchEvent(new Event("jc-pwa-change"));
  });

  if ("serviceWorker" in navigator) {
    const register = () => void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }
}

export function InstallButton({ className = "" }: { className?: string }) {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    initPwa();
    setIos(isIos());
    const sync = () => {
      setInstalled(isStandalone());
      setPrompt(deferredPrompt);
    };
    sync();
    window.addEventListener("jc-pwa-change", sync);
    return () => window.removeEventListener("jc-pwa-change", sync);
  }, []);

  if (installed) return null;

  const install = async () => {
    if (prompt) {
      await prompt.prompt();
      await prompt.userChoice.catch(() => undefined);
      deferredPrompt = null;
      setPrompt(null);
    } else {
      setShowIosHelp((open) => !open);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void install()}
        title="Install JayCode as an app"
        className={`flex items-center gap-1.5 rounded-md border border-primary/60 bg-primary/10 px-2.5 py-1.5 text-[11px] font-medium text-primary transition hover:bg-primary hover:text-primary-foreground ${className}`}
      >
        <Download className="h-3.5 w-3.5" /> Install app
      </button>
      {showIosHelp && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-border bg-popover p-3 text-left text-xs leading-5 text-popover-foreground shadow-xl">
          {ios ? (
            <>
              On iPhone/iPad: tap <Share className="inline h-3.5 w-3.5" /> <strong>Share</strong> in
              Safari, then <strong>Add to Home Screen</strong>.
            </>
          ) : (
            <>
              Open your browser menu (<strong>⋮</strong> or the install icon in the address bar) and
              choose <strong>Install JayCode</strong> / <strong>Add to Home screen</strong>.
              <span className="mt-2 block text-muted-foreground">
                Not there? The app may already be installed, or this browser can't install apps —
                try Chrome or Edge.
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
