import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 'happy-dom' statt 'node' — brauchen wir für localStorage in settings.test.js
    environment: 'happy-dom',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js', 'js/bc-auth.js', 'js/bc-settings.js'],
      reporter: ['text', 'lcov'],
      thresholds: {
        lines:     75,
        functions: 75,
        branches:  65,
      },
    },
  },
});
