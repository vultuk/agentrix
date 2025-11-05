import { fileURLToPath } from 'node:url';
import path from 'node:path';

import js from '@eslint/js';
import globals from 'globals';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

const projectDir = path.dirname(fileURLToPath(import.meta.url));

const reactRecommendedRules = reactPlugin.configs.recommended?.rules ?? {};
const reactJsxRuntimeRules = reactPlugin.configs['jsx-runtime']?.rules ?? {};
const reactHooksRecommendedRules = reactHooksPlugin.configs.recommended?.rules ?? {};
const jsxA11yRecommendedRules = jsxA11yPlugin.configs.recommended?.rules ?? {};

export default tseslint.config(
  {
    name: 'agentrix/ignores',
    ignores: [
      'dist',
      'ui/dist',
      'coverage',
      '**/node_modules',
      '**/*.d.ts',
      '**/*.generated.*',
      'ui/.vite'
    ]
  },
  {
    name: 'agentrix/linter-options',
    linterOptions: {
      reportUnusedDisableDirectives: 'off'
    }
  },
  {
    ...js.configs.recommended,
    name: 'agentrix/javascript',
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'off'
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-console': 'off',
      'prefer-const': 'off'
    }
  },
  {
    name: 'agentrix/backend-typescript',
    files: ['src/**/*.ts', 'scripts/**/*.{ts,cts,mts}', '*.ts'],
    extends: [
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
      eslintConfigPrettier
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: projectDir
      },
      globals: {
        ...globals.node
      }
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-optional-chain': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/consistent-indexed-object-style': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'prefer-const': 'off'
    }
  },
  {
    name: 'agentrix/frontend-typescript',
    files: ['ui/src/**/*.{ts,tsx}'],
    extends: [
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
      eslintConfigPrettier
    ],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'jsx-a11y': jsxA11yPlugin
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: './ui/tsconfig.json',
        tsconfigRootDir: projectDir
      },
      globals: {
        ...globals.browser,
        ...globals.es2021
      }
    },
    settings: {
      react: {
        version: 'detect'
      }
    },
    rules: {
      ...reactRecommendedRules,
      ...reactJsxRuntimeRules,
      ...reactHooksRecommendedRules,
      ...jsxA11yRecommendedRules,
      '@typescript-eslint/consistent-type-imports': 'off',
      'react-hooks/exhaustive-deps': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-optional-chain': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/consistent-indexed-object-style': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'prefer-const': 'off',
      'react/prop-types': 'off',
      'react/jsx-props-no-spreading': 'off',
      'react-hooks/rules-of-hooks': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
      '@typescript-eslint/ban-ts-comment': 'off'
    }
  },
  eslintConfigPrettier
);
