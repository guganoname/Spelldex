import { copyFile } from 'node:fs/promises';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Data artifacts (catalog, prices, lore, scan index) are versioned by manifest.json and updated by
// the data worker itself, so they are NOT precached; scanner engines (OpenCV, Tesseract) are
// runtime-cached on first scan to keep the first install small.
// Deployed under a sub path on GitHub Pages (VITE_BASE=/spelldex/), at the root elsewhere.
const base = process.env.VITE_BASE ?? '/';

/** Static hosts without rewrites (GitHub Pages) serve 404.html for deep links like /karte/…. */
const spaFallback = (): Plugin => ({
  name: 'spelldex-spa-fallback',
  apply: 'build',
  async writeBundle(opts) {
    if (opts.dir) await copyFile(`${opts.dir}/index.html`, `${opts.dir}/404.html`);
  },
});

export default defineConfig({
  base,
  plugins: [
    spaFallback(),
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Spelldex',
        short_name: 'Spelldex',
        description: 'Ein Pokédex für Magic-Karten: scannen, nachschlagen, sammeln. Offline.',
        lang: 'de',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f0d12',
        theme_color: '#2b1d16',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,wasm,woff2,svg,png,glb,ktx2}'],
        globIgnores: ['data/**', '**/opencv*', '**/tesseract*'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [/\/data\//],
        runtimeCaching: [
          {
            // Card images: Scryfall CDN, never altered. Long-lived cache, bounded size.
            urlPattern: ({ url }) => url.origin === 'https://cards.scryfall.io',
            handler: 'CacheFirst',
            options: {
              cacheName: 'scryfall-images',
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://svgs.scryfall.io',
            handler: 'CacheFirst',
            options: { cacheName: 'scryfall-symbols', expiration: { maxAgeSeconds: 60 * 60 * 24 * 90 } },
          },
          {
            urlPattern: ({ url }) => /\/(scan|engines)\//.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'scan-engines' },
          },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  server: { host: true },
  build: { target: 'es2022', sourcemap: true },
});
