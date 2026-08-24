/**
 * StreamRoom ESLint Flat Config.
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist/**', 'viewer/dist/**', 'coverage/**', '.cache/**', 'site/**', '**/dist/**']),

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': 'off',
      'no-unassigned-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-wrapper-object-types': 'off',
      'no-empty': 'off',
      'no-undef': 'off',
    },
  },

  {
    files: [
      'server/**/*.{js,ts}',
      'scripts/**/*.mjs',
      'api/**/*.{js,ts}',
      'streamer/**/*',
      'viewer/vite.config.{js,ts}',
      'vitest.*.{js,ts}',
    ],
    ignores: ['server/public/**'],
    languageOptions: { globals: globals.node },
  },

  {
    files: ['viewer/src/**/*.{js,jsx,ts,tsx}', 'server/public/**/*.{js,ts}'],
    languageOptions: { globals: { ...globals.browser, ...globals.worker } },
    rules: {
      'no-unused-vars': 'off',
      'no-unassigned-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-useless-assignment': 'off',
    },
  },

  prettier,
]);
