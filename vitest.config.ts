import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// NOTE: the plan's original config used `environmentMatchGlobs`, which was
// removed in Vitest 4 (the version installed here). `test.projects` is the
// Vitest 4 replacement and reproduces the same behavior: `src/main/**` (and
// everything else) runs under Node, only `src/renderer/**` runs under jsdom.
export default defineConfig({
  plugins: [react()],
  test: {
    setupFiles: ['src/renderer/src/vitest-setup.ts'],
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: ['src/renderer/**']
        }
      },
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['src/renderer/**/*.test.{ts,tsx}']
        }
      }
    ]
  }
})
