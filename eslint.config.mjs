import tseslint from 'typescript-eslint';
import tsdoc from 'eslint-plugin-tsdoc';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'artifacts/**'],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { tsdoc },
    rules: {
      // Every doc block is parsed. A malformed or undeclared tag fails the build
      // rather than review. New tags are declared in tsdoc.json and nowhere else.
      'tsdoc/syntax': 'error',

      // Invariant: strictest typing. An escape hatch needs a comment saying why.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',

      // Named exports only, so imports stay greppable and renames stay honest.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'No default exports. Use a named export.',
        },
      ],

      // A promise that nobody awaits is a bug that hides until production.
      '@typescript-eslint/no-floating-promises': 'error',

      '@typescript-eslint/explicit-module-boundary-types': 'error',
    },
  },
);
