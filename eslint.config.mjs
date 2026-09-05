import tseslint from 'typescript-eslint';
import tsdoc from 'eslint-plugin-tsdoc';

/**
 * Rules that apply wherever a doc block can appear, in TypeScript and in a build script.
 * tsdoc/syntax is what makes the documentation convention enforced rather than reviewed:
 * a malformed tag, or a tag not declared in tsdoc.json, fails the build.
 */
const docRules = {
  'tsdoc/syntax': 'error',
};

/** Rules that need the type checker, so they apply only to files inside tsconfig.json. */
const typedRules = {
  // Invariant 5: strictest typing. An escape hatch needs a comment saying why.
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-non-null-assertion': 'error',
  '@typescript-eslint/no-unnecessary-condition': 'error',
  '@typescript-eslint/explicit-module-boundary-types': 'error',

  // A promise nobody awaits is a bug that hides until production.
  //
  // node:test is the one honest exception. describe() and it() return a promise that the
  // runner itself awaits, and a caller that awaits it as well changes the reported
  // ordering. Listing them as known safe keeps the rule on everywhere else, which is the
  // point: turning the rule off for spec files would hide a genuinely floating promise
  // inside a test.
  '@typescript-eslint/no-floating-promises': [
    'error',
    {
      allowForKnownSafeCalls: [
        {
          from: 'package',
          package: 'node:test',
          name: ['describe', 'it', 'test', 'before', 'after', 'beforeEach', 'afterEach'],
        },
      ],
    },
  ],

  // Named exports only, so an import stays greppable and a rename stays honest.
  'no-restricted-syntax': [
    'error',
    {
      selector: 'ExportDefaultDeclaration',
      message: 'No default exports. Use a named export.',
    },
  ],
};

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'artifacts/**', '.remember/**', '.claude/**'],
  },
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { tsdoc },
    rules: { ...docRules, ...typedRules },
  },
  {
    // Build scripts and this config are plain ESM and sit outside tsconfig.json, so the
    // typed rules cannot run on them. The doc rule still can, and still should.
    files: ['**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    plugins: { tsdoc },
    rules: docRules,
  },
);
