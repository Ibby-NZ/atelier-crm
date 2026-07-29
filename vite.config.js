import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Atelier platform demo. base:'./' so the built dist/ opens from any path (incl. file://-style hosting).
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { host: true, port: 5273 },
})
