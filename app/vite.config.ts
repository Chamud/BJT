import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

// content/private holds your purchased book pages/audio. It is served by the local dev server only
// and stripped from production builds so it can never be deployed by accident.
const stripPrivate = (): Plugin => ({
  name: 'strip-private',
  apply: 'build',
  closeBundle() {
    rmSync(resolve(__dirname, 'dist/private'), { recursive: true, force: true })
    rmSync(resolve(__dirname, 'dist/images/candidates'), { recursive: true, force: true }) // unpicked image drafts
  },
})

// Content packs live in ../content and are served as static files,
// so adding a pack never needs a rebuild — just refresh the page.
export default defineConfig({
  plugins: [react(), stripPrivate()],
  publicDir: '../content',
  // strictPort: your progress lives in browser storage tied to this exact address — never silently move ports
  server: { port: 5180, strictPort: true, open: true },
})
