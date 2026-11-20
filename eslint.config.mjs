import js from '@eslint/js';
import nextVitals from 'eslint-config-next/core-web-vitals';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  { ignores: ['**/node_modules/**', '**/.next/**', 'docs/**', 'design/**'] },
  { ...js.configs.recommended, files: ['**/*.{js,jsx,mjs}'] },
  {
    files: ['*.mjs', 'scripts/**/*.mjs', 'apps/api/**/*.js'],
    languageOptions: { globals: globals.node },
  },
  ...nextVitals.map((config) => ({
    ...config,
    files: ['apps/web/**/*.{js,jsx,mjs}'],
  })),
  {
    files: ['apps/web/**/*.{js,jsx,mjs}'],
    settings: { next: { rootDir: 'apps/web/' } },
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/apps/api/**',
                '**/api/src/**',
                '@make-my-marriage/api',
                '@make-my-marriage/api/*',
              ],
              message:
                'Use the REST API client; never import backend code into the web app.',
            },
          ],
        },
      ],
    },
  },
  prettier,
];
