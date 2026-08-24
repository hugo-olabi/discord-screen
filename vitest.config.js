import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.js'],
    include: ['viewer/**/*.test.js'],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['viewer/src/**/*.js', 'streamer/**/*.js'],
      exclude: ['**/*.test.js'],
    },
  },
});
