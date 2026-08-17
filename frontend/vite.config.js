import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt', not 'autoUpdate': staff fill in member and payment forms, and an
      // automatic reload the moment a new build lands would throw away what they typed.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'FlexHub — Gym Management',
        short_name: 'FlexHub',
        description: 'Manage members, attendance, payments and equipment across your gym branches.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        // Matches the app shell (bg-gray-900 in Sidebar.jsx / the mobile header), so the
        // splash and status bar don't flash a different colour on launch.
        background_color: '#111827',
        theme_color: '#111827',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the app shell only — every hashed JS/CSS asset plus the icons.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // Without this, an offline navigation to an API path would be answered with the
        // SPA shell instead of failing — and /health would stop being a real health check.
        navigateFallbackDenylist: [/^\/api/, /^\/health/],
        // Deliberately NO runtimeCaching for /api. Responses are authenticated and
        // tenant-scoped; serving one gym a cached response — or showing stale membership
        // and payment figures — is worse than an honest network error.
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        // Keeps `npm run dev` free of service-worker caching weirdness; the SW is
        // exercised via `npm run build` + `npm run preview` (or the backend serving dist).
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
});
