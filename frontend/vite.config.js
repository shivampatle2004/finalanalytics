import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react()
  ],
  resolve: {
    alias: {
      '@ui': path.resolve(__dirname, './src/modules/etl/components/ui'),
      '@services': path.resolve(__dirname, './src/shared/services'),
    },
  },
  server: {
    allowedHosts: true,
    proxy: {
      // ── ETL Backend ───────────────────────────────────────────
      '/etl/api': {
        target: process.env.VITE_USE_REMOTE === 'true' ? 'https://etlmain.onestopanalytics.com' : 'http://127.0.0.1:8111',
        // target: 'https://etlmain.onestopanalytics.com', // Remote Domain
        // target: 'http://127.0.0.1:8111', // Local Fallback
        changeOrigin: true,
        secure: false,
      },
      '/etl/ws': {
        target: process.env.VITE_USE_REMOTE === 'true' ? 'wss://etlmain.onestopanalytics.com' : 'ws://127.0.0.1:8111',
        changeOrigin: true,
        secure: false,
        ws: true,
      },

      // ── Analytics Backend ─────────────────────────────────────
      '/analytics/api': {
        target: process.env.VITE_USE_REMOTE === 'true' ? 'https://analyticsmain.onestopanalytics.com/analytics' : 'http://127.0.0.1:8010',
        changeOrigin: true,
        secure: false,
      },
      // Legacy Analytics API routes
      '/api': {
        target: process.env.VITE_USE_REMOTE === 'true' ? 'https://analyticsmain.onestopanalytics.com/analytics' : 'http://127.0.0.1:8010/analytics',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, '')
      },

      // ── DW Backend ────────────────────────────────────────────
      '/dw': {
        target: process.env.VITE_USE_REMOTE === 'true' ? 'https://dwmain.onestopanalytics.com' : 'http://127.0.0.1:8004',
        changeOrigin: true,
        secure: false,
        bypass: function (req) {
          // For browser navigation (HTML), serve the Vite SPA instead of proxying
          if (req.headers.accept && req.headers.accept.includes('text/html')) {
            return req.url; // Bypass proxy, let Vite serve index.html
          }
          // All API/fetch requests go to the backend
        }
      },
    },
  },
})
