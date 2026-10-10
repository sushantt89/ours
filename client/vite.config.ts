import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const api = env.VITE_DEV_API || 'http://localhost:4000';
  // Identifies this build, so an installed app can tell when the server has a newer one.
  const commit = (process.env.RENDER_GIT_COMMIT || process.env.SOURCE_COMMIT || '').slice(0, 7);
  const built = new Date().toISOString().slice(0, 16).replace('T', ' ');

  return {
    define: {
      __APP_COMMIT__: JSON.stringify(commit),
      __APP_BUILT__: JSON.stringify(built),
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['icons/*.png', 'icons/*.svg', 'widgets/*.json'],
        injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'], globIgnores: ['dev-push-sw.js'], maximumFileSizeToCacheInBytes: 4 * 1024 * 1024 },
        devOptions: { enabled: false },
        manifest: {
          id: '/',
          name: 'Ours — a private home for two',
          short_name: 'Ours',
          description: 'A private digital home for two people: chat, memories, notes, nudges and everything in between.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#fbf6f2',
          theme_color: '#fbf6f2',
          categories: ['lifestyle', 'social'],
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          // Long-press the app icon (Android, Windows, macOS) to jump straight to these.
          shortcuts: [
            { name: 'Send love', short_name: 'Send love', url: '/quick?send=love', icons: [{ src: '/icons/shortcut-love.png', sizes: '96x96' }] },
            { name: 'Send a nudge', short_name: 'Nudge', url: '/quick', icons: [{ src: '/icons/shortcut-nudge.png', sizes: '96x96' }] },
            { name: 'Open chat', short_name: 'Chat', url: '/chat', icons: [{ src: '/icons/shortcut-chat.png', sizes: '96x96' }] },
            { name: 'Add a memory', short_name: 'Memory', url: '/memories?add=1', icons: [{ src: '/icons/shortcut-memory.png', sizes: '96x96' }] },
          ],
          // Experimental: PWA widgets for the Windows 11 Widgets board (Microsoft Edge only).
          ...({
            widgets: [
              {
                name: 'Days together',
                short_name: 'Together',
                tag: 'counter',
                description: 'How long you two have been together',
                template: 'counter',
                ms_ac_template: '/widgets/counter.json',
                data: '/widgets/empty.json',
                type: 'application/json',
                auth: false,
                update: 21600,
                icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
                screenshots: [{ src: '/icons/widget-counter.png', sizes: '600x400', label: 'Days together' }],
              },
              {
                name: 'Next special date',
                short_name: 'Next date',
                tag: 'next-date',
                description: 'Countdown to your next special day',
                template: 'next-date',
                ms_ac_template: '/widgets/next-date.json',
                data: '/widgets/empty.json',
                type: 'application/json',
                auth: false,
                update: 21600,
                icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
                screenshots: [{ src: '/icons/widget-next.png', sizes: '600x400', label: 'Next special date' }],
              },
            ],
          } as object),
        },
      }),
    ],
    resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: api, changeOrigin: true },
        '/socket.io': { target: api, ws: true, changeOrigin: true },
      },
    },
    build: { target: 'es2022', sourcemap: false },
  };
});
