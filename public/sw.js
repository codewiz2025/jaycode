// Minimal service worker so JayCode is installable. It deliberately does not cache
// anything: the app is signed-in, cloud-synced and must always load fresh data.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // Let the browser handle every request normally (network).
});
