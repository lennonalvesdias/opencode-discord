// vitest.config.js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['src/**/*.js'],
      exclude: ['src/index.js'] // entry point difícil de testar em unit tests
    }
  }
})
