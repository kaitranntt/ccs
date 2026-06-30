import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import noNewThrowError from './eslint-rules/no-new-throw-error.js';

const __configDir = path.dirname(fileURLToPath(import.meta.url));
const baselinePath = path.join(__configDir, 'eslint-rules', 'throw-error-baseline.json');
const throwErrorBaseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

export default [
  {
    files: ['src/**/*.ts'],
    ignores: ['src/**/__tests__/**'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      // Local enforcement rules (P7 gates).
      ccs: { rules: { 'no-new-throw-error': noNewThrowError } },
    },
    rules: {
      // TypeScript rules - upgraded to errors for stricter type safety
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-non-null-assertion': 'error',

      // General code quality
      'no-console': 'off', // CLI tool needs console
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': ['error', 'always'],

      // P7 enforcement gates:
      // - no-new-throw-error: error on NEW throw new Error(...) outside the
      //   generated baseline (eslint-rules/throw-error-baseline.json). Forces
      //   the typed-error taxonomy (src/errors/error-types.ts). Regenerate the
      //   baseline with: node scripts/generate-throw-error-baseline.js
      // - max-lines: warn on files over 400 LOC (goal of P5/P6 god-file splits).
      'ccs/no-new-throw-error': ['error', { allowlist: throwErrorBaseline }],
      'max-lines': ['warn', { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['tests/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'commonjs',
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  prettier,
];
