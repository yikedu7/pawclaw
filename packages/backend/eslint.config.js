import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    // Apply TypeScript parsing to all TS files
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
      // Use a structured logger (e.g. fastify.log) instead.
      'no-console': 'error',

      // Warn when a file exceeds 200 lines; error at 350.
      // Large files are a signal that a module has too many responsibilities.
      'max-lines': ['warn', { max: 200, skipBlankLines: true, skipComments: true }],
    },
  },

  // ── Layer: db ────────────────────────────────────────────────────────────
  // The db layer sits below api/runtime/ws in the dependency hierarchy:
  //   shared → db → api → runtime → ws
  // db/ must NEVER import from api/, runtime/, or ws/ — doing so would create
  // a circular dependency and violate the layered architecture.
  {
    files: ['src/db/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../api', '../api/**'],
              message:
                'Layer violation: db/ must not import from api/. ' +
                'Architecture order is shared → db → api → runtime → ws.',
            },
            {
              group: ['../runtime', '../runtime/**'],
              message:
                'Layer violation: db/ must not import from runtime/. ' +
                'Architecture order is shared → db → api → runtime → ws.',
            },
            {
              group: ['../ws', '../ws/**'],
              message:
                'Layer violation: db/ must not import from ws/. ' +
                'Architecture order is shared → db → api → runtime → ws.',
            },
          ],
        },
      ],
    },
  },

  // ── Layer: api ───────────────────────────────────────────────────────────
  // The api layer sits below runtime and ws in the dependency hierarchy:
  //   shared → db → api → runtime → ws
  // api/ must NEVER import from runtime/ or ws/ — those layers sit above api
  // in the stack and importing them would create upward dependencies.
  {
    files: ['src/api/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../runtime', '../runtime/**'],
              message:
                'Layer violation: api/ must not import from runtime/. ' +
                'Architecture order is shared → db → api → runtime → ws.',
            },
            {
              group: ['../ws', '../ws/**'],
              message:
                'Layer violation: api/ must not import from ws/. ' +
                'Architecture order is shared → db → api → runtime → ws.',
            },
          ],
        },
      ],
    },
  },
];
