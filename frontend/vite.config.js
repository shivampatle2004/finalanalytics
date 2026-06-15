import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// Helper to determine proxy target based on the request's origin/host
const getProxyTarget = (req, localTarget, remoteTarget) => {
  const host = req.headers.host || '';
  const referer = req.headers.referer || '';
  const origin = req.headers.origin || '';
  const isLocal = 
    host.includes('localhost') || 
    host.includes('127.0.0.1') || 
    host.includes('0.0.0.0') || 
    host.includes('[::1]') ||
    referer.includes('localhost') || 
    referer.includes('127.0.0.1') ||
    origin.includes('localhost') || 
    origin.includes('127.0.0.1');

  const target = isLocal ? localTarget : remoteTarget;
  console.log(`[Proxy] Routing ${req.url} (Host: ${host}) -> ${target}`);
  return target;
};

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
        target: 'http://127.0.0.1:8111',
        changeOrigin: true,
        secure: false,
        router: (req) => getProxyTarget(req, 'http://127.0.0.1:8111', 'https://etlmain.onestopanalytics.com')
      },
      '/etl/ws': {
        target: 'ws://127.0.0.1:8111',
        changeOrigin: true,
        secure: false,
        ws: true,
        router: (req) => getProxyTarget(req, 'ws://127.0.0.1:8111', 'wss://etlmain.onestopanalytics.com')
      },

      // ── Analytics Backend ─────────────────────────────────────
      '/analytics/api': {
        target: 'http://127.0.0.1:8010',
        changeOrigin: true,
        secure: false,
        router: (req) => getProxyTarget(req, 'http://127.0.0.1:8010', 'https://analyticsmain.onestopanalytics.com/analytics')
      },
      // Legacy Analytics API routes
      '/api': {
        target: 'http://127.0.0.1:8010/analytics',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
        router: (req) => getProxyTarget(req, 'http://127.0.0.1:8010/analytics', 'https://analyticsmain.onestopanalytics.com/analytics')
      },

      // ── DW Backend ────────────────────────────────────────────
      '/dw': {
        target: 'http://127.0.0.1:8004',
        changeOrigin: true,
        secure: false,
        bypass: function (req) {
          // For browser navigation (HTML), serve the Vite SPA instead of proxying
          if (req.headers.accept && req.headers.accept.includes('text/html')) {
            return req.url; // Bypass proxy, let Vite serve index.html
          }
          // All API/fetch requests go to the backend
        },
        router: (req) => getProxyTarget(req, 'http://127.0.0.1:8004', 'https://dwmain.onestopanalytics.com')
      },
    },
  },
})
