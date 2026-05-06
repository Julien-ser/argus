import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/sessions':  'http://localhost:7777',
      '/events':    'http://localhost:7777',
      '/flags':     'http://localhost:7777',
      '/ingest':    'http://localhost:7777',
      '/health':    'http://localhost:7777',
      '/analytics': 'http://localhost:7777',
      '/trust':     'http://localhost:7777',
      '/projects':  'http://localhost:7777',
    }
  },
})
