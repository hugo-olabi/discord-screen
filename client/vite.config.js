import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    solidPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['streamroom-banner.png'],
      manifest: {
        name: 'StreamRoom',
        short_name: 'StreamRoom',
        description: 'Zero-latency screen and audio sharing via WebCodecs & WebRTC/WebSocket',
        theme_color: '#1e1f22',
        background_color: '#000000',
        display: 'standalone',
        icons: [
          {
            src: 'streamroom-banner.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'streamroom-banner.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/_/, /^\/api/],
      },
    }),
  ],
  envDir: '..',
  server: {
    port: 5173,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});
