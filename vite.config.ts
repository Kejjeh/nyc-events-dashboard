/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Project is served from https://<user>.github.io/nyc-events-dashboard/
export default defineConfig({
  base: '/nyc-events-dashboard/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'NYC Events',
        short_name: 'NYC Events',
        description: 'Music, food, sports & more across New York City — refreshed twice daily.',
        theme_color: '#7c5cff',
        background_color: '#0f1115',
        display: 'standalone',
        start_url: '/nyc-events-dashboard/',
        scope: '/nyc-events-dashboard/',
        icons: [
          { src: '/nyc-events-dashboard/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /\/data\/events\.json/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'nyc-events-data', expiration: { maxAgeSeconds: 60 * 60 * 12 } },
          },
        ],
      },
    }),
  ],
  test: {
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
