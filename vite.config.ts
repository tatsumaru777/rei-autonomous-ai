import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    nodePolyfills(),
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-able-icon.png'],
      manifest: {
        name: '零 (Rei) - Autonomous AI Secretary',
        short_name: 'Rei AI',
        description: 'Tatsumaru\'s Autonomous AI Secretary',
        theme_color: '#0a0a0c',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  optimizeDeps: {
    // @ts-ignore - scanner property is available in Vite 6+ but may not be in current types
    scanner: 'esbuild'
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/twitter': {
        target: 'https://api.twitter.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/twitter/, ''),
        headers: {
          'Origin': 'https://twitter.com'
        }
      }
    }
  }
})
