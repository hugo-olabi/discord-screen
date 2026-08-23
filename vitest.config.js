import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.js'],
    include: ['shared/**/*.test.js'],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['shared/**/*.js', 'native-streamer/**/*.js'],
      exclude: ['**/*.test.js'],
    },
  },
});
