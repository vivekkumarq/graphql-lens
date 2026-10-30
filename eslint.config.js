import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  { ignores: ['dist'] },
  js.configs.recommended,
  tseslint.configs.strict,
  reactHooks.configs.flat.recommended,
  {
    languageOptions: { globals: { ...globals.browser, chrome: 'readonly' } },
    // indices are bounds-checked under noUncheckedIndexedAccess; `!` marks those spots
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  { files: ['scripts/**', 'demo/**'], languageOptions: { globals: globals.node } },
]);
