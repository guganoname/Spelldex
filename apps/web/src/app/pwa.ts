/** Service worker: precaches the app shell; a new version is applied on the next start. */
export function registerServiceWorker(): void {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  void import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({ immediate: true });
  });
}
