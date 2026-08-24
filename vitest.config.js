import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.js'],
    include: ['viewer/**/*.test.{js,ts}'],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['viewer/src/**/*.{js,ts}', 'streamer/**/*.js'],
      exclude: ['**/*.test.{js,ts}'],
    },
  },
});
