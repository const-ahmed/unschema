import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts so unit tests run in plain Node, without
// the Cloudflare or TanStack Start plugins. Tests mock Jev; they never call Workers AI.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
