import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // Prohibit console usage in production source code.
      // Use a dedicated logging utility instead.
      'no-console': 'error',

      // Warn when a file exceeds 200 lines; error at 350.
      // Large files are a signal that a module has too many responsibilities.
      'max-lines': ['warn', { max: 200, skipBlankLines: true, skipComments: true }],
    },
  },
];
