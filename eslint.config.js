/**
 * StreamRoom ESLint Flat Config.
 */
import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist/**', 'viewer/dist/**', 'coverage/**', '.cache/**', 'site/**', '**/dist/**']),

  js.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      'no-empty': 'off',
    },
  },

  {
    files: [
      'server/**/*.js',
      'scripts/**/*.mjs',
      'api/**/*.js',
      'streamer/**/*',
      'viewer/vite.config.js',
      'vitest.*.js',
    ],
    ignores: ['server/public/**'],
    languageOptions: { globals: globals.node },
  },

  {
    files: ['viewer/src/**/*.js', 'server/public/**/*.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.worker } },
    rules: {
      'no-unused-vars': 'off',
      'no-useless-assignment': 'off',
    },
  },

  prettier,
]);
