/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative asset URLs, so the site works at any path or port NOMAD publishes it on.
  base: './',
  test: { globals: true, exclude: ['**/node_modules/**', 'data-raw/**'] },
})
