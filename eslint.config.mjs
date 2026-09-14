// @ts-check
import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import importX from 'eslint-plugin-import-x';
import n from 'eslint-plugin-n';
import tseslint from 'typescript-eslint';

// ── Base: plugins, parser, paths ────────────────────────────────────────────

// Every part goes through tseslint.config(): it validates the shape and infers rule
// levels as tuples instead of string[] — without it @ts-check rejects ['error', {...}]
const base = tseslint.config(
    { ignores: ['dist/**', 'reference/**'] },

    {
        plugins: { 'import-x': importX },

        languageOptions: {
            parserOptions: {
                // eslint.config.mjs is outside tsconfig — lint it without types
                projectService: { allowDefaultProject: ['eslint.config.mjs'] },
                tsconfigRootDir: import.meta.dirname,
            },
        },

        settings: {
            // src/*.ts ships as dist/*.js — otherwise eslint-plugin-n can't find the files
            n: { convertPath: { 'src/**/*.ts': ['^src/(.+)\\.ts$', 'dist/$1.js'] } },
        },
    },
);

// ── 1. Correctness: what breaks at runtime ──────────────────────────────────

const correctness = tseslint.config(
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    n.configs['flat/recommended-module'],

    {
        rules: {
            // A forgotten await is the top source of silent bugs in a CLI
            '@typescript-eslint/no-floating-promises': ['error', {
                // describe/it/test from node:test register a test, they need no await
                allowForKnownSafeCalls: [
                    { from: 'package', package: 'node:test', name: ['describe', 'it', 'test'] },
                ],
            }],
            '@typescript-eslint/no-misused-promises': 'error',
            '@typescript-eslint/return-await': ['error', 'in-try-catch'],

            'eqeqeq': ['error', 'always', { null: 'ignore' }],
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
            }],

            // Print through this.log only, or --json breaks
            'no-console': 'error',
            // oclif owns process exit, through error exit codes
            'n/no-process-exit': 'error',
            // import 'node:fs', not 'fs'
            'n/prefer-node-protocol': 'error',

            // The rule reads engines.node and rejects whatever Node's docs still label
            // Experimental — even an API that shipped years earlier. These two run on every
            // version we support; only the label moved later. Listing them here keeps a
            // doc-stability marker from inflating the package's public engines contract:
            //   readline/promises   — shipped in 17.0.0, labelled Stable in 22.17
            //   import.meta.dirname — shipped in 20.11.0, labelled Stable in 22.16
            'n/no-unsupported-features/node-builtins': ['error', {
                ignores: ['readline/promises', 'import.meta.dirname'],
            }],
        },
    },

    {
        // scripts/ and bin/ aren't oclif commands: they print and set the exit code themselves
        files: ['scripts/**', 'bin/**'],
        rules: {
            'no-console': 'off',
            'n/no-process-exit': 'off',
            // both launchers need a shebang, though package.json bin lists only run.js
            'n/hashbang': 'off',
        },
    },
);

// ── 2. TypeScript conventions ───────────────────────────────────────────────

const typescript = tseslint.config(
    tseslint.configs.stylisticTypeChecked,

    {
        rules: {
            // type over interface; interface only where declarations must merge
            '@typescript-eslint/consistent-type-definitions': ['error', 'type'],

            // a separate `import type { X }`, not `import { type X }`
            '@typescript-eslint/consistent-type-imports': ['error', {
                prefer: 'type-imports',
                fixStyle: 'separate-type-imports',
            }],
            'import-x/consistent-type-specifier-style': ['error', 'prefer-top-level'],

            // `export { type X } from './m'` leaves an empty `export {}` at runtime,
            // while a separate `export type { X }` is erased completely
            '@typescript-eslint/consistent-type-exports': ['error', {
                fixMixedExportsWithInlineTypeSpecifier: false,
            }],
            '@typescript-eslint/no-import-type-side-effects': 'error',

            '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
            // exhaustive switch over a union — command routing
            '@typescript-eslint/switch-exhaustiveness-check': 'error',
        },
    },
);

// ── 3. Formatting ───────────────────────────────────────────────────────────

const formatting = tseslint.config(
    stylistic.configs.customize({
        indent: 4,
        quotes: 'single',
        semi: true,
        braceStyle: '1tbs',
        commaDangle: 'always-multiline',
        jsx: false,
    }),

    {
        rules: {
            'curly': ['error', 'all'],
            '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: false }],
            '@stylistic/semi': ['error', 'always'],
            '@stylistic/member-delimiter-style': 'error',
            '@stylistic/lines-between-class-members': ['error', 'always', { exceptAfterSingleLine: true }],
            '@stylistic/max-len': ['warn', {
                code: 120,
                ignoreStrings: true,
                ignoreTemplateLiterals: true,
                ignoreUrls: true,
                ignoreRegExpLiterals: true,
                // a suppression comment can't be wrapped: the directive must sit on one line
                ignorePattern: '// eslint-disable',
            }],

            // Multiline statements get blank lines around them, one-liners may sit together
            '@stylistic/padded-blocks': ['error', 'never'],
            '@stylistic/padding-line-between-statements': [
                'error',
                { blankLine: 'always', prev: 'import', next: '*' },
                { blankLine: 'any', prev: 'import', next: 'import' },
                { blankLine: 'any', prev: ['const', 'let'], next: ['const', 'let'] },
                {
                    blankLine: 'always',
                    prev: '*',
                    next: ['multiline-const', 'multiline-let', 'multiline-expression', 'multiline-block-like'],
                },
                {
                    blankLine: 'always',
                    prev: ['multiline-const', 'multiline-let', 'multiline-expression', 'multiline-block-like'],
                    next: '*',
                },
                { blankLine: 'always', prev: '*', next: 'return' },
            ],

            'import-x/order': ['error', {
                'groups': ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
                'newlines-between': 'always',
                'alphabetize': { order: 'asc', caseInsensitive: true },
                'warnOnUnassignedImports': true,
            }],
            'import-x/no-duplicates': 'error',

            // A nested ternary is an if/else written unreadably
            'no-nested-ternary': 'error',
            // `x ? true : false` and `x ? x : y` instead of Boolean(x) and x ?? y
            'no-unneeded-ternary': ['error', { defaultAssignment: false }],
            // spell the cast out: Boolean(x), Number(x), String(x) — not !!x, +x, '' + x
            'no-implicit-coercion': 'error',
        },
    },
);

// ── 4. Architecture: one dependency arrow, cli → sdk → core ─────────────────

// Patterns match the import string as written, not the resolved path: a relative
// specifier has no `sdk` segment and the number of `../` isn't known up front.
// The form without `/**` catches a barrel import of the directory.
// import-x/no-restricted-paths would express the same zones over real paths, but it resolves
// the specifier first, and a '.js' specifier pointing at a '.ts' file resolves to nothing here —
// the rule then passes silently. Making it work needs eslint-import-resolver-typescript; until
// that is worth a dependency, patterns are the only boundary that actually fires.
const noOclif = {
    group: ['@oclif/*'],
    message: 'sdk must not depend on oclif: the framework lives in src/cli',
};

const noCli = {
    group: ['**/cli', '**/cli/**'],
    message: 'sdk must not import cli',
};

const noProducts = {
    group: ['**/adapty', '**/adapty/**', '**/asa', '**/asa/**'],
    message: 'core must not know about products',
};

// Both layers live in src while the migration runs, so the arrow is spelled out.
const noLegacy = {
    group: ['**/lib', '**/lib/**'],
    message: 'sdk must not import src/lib: that layer is what sdk replaces',
};

// src/lib is frozen (test/architecture/frozen-legacy.test.ts). These three are the whole of what
// the new layer still borrows from it; a fourth one means either porting the helper into sdk, or
// a deliberate edit here.
//
// `**/lib/*` and not `**/lib/**`: the patterns follow gitignore semantics, where a negation cannot
// re-include a file whose parent directory the group already excluded. src/lib is flat, so one
// level is the whole of it.
const legacyBridgesOnly = {
    group: [
        '**/lib/*',
        '!**/lib/app-url.js', '!**/lib/client-from-config.js', '!**/lib/output.js',
    ],
    message: 'src/lib is frozen: only app-url, client-from-config and output may still be borrowed',
};

// A command that outgrew one file keeps private helpers in its own lib/ (command-layout.test.ts).
// `./lib/*` is the only way to spell "the lib next to me", so the freeze above can re-include
// exactly that — another command's lib is still out of reach, and so is src/lib.
const ownCommandLib = {
    group: [...legacyBridgesOnly.group, '!./lib/*'],
    message: 'src/lib is frozen to app-url, client-from-config and output; a lib/ inside another command is private to it',
};

// The transport stands on core primitives and pulls in no neighbours (testing, session, auth).
// A pattern sees only the specifier, so the allowlist is spelled as negations.
const corePrimitivesOnly = {
    group: ['../*', '../*/**', '!../errors.js', '!../clock.js'],
    message: 'the transport depends on core primitives only: errors and clock',
};

// core/http is a module with one door: its internals can be rearranged without touching consumers.
const httpDoorOnly = {
    group: ['**/core/http/*', '!**/core/http/index.js'],
    message: 'core/http has one door: import it through core/http/index.js',
};

// Live for src/sdk/core; the blocks for products and for src/cli wait for those layers.
const architecture = tseslint.config(
    {
        files: ['src/sdk/**/*.ts'],
        rules: { 'no-restricted-imports': ['error', { patterns: [noOclif, noCli, noLegacy] }] },
    },

    {
        // A later block replaces rule options instead of merging, so sdk boundaries repeat here
        files: ['src/sdk/core/**/*.ts'],
        rules: { 'no-restricted-imports': ['error', { patterns: [noOclif, noCli, noLegacy, noProducts] }] },
    },

    {
        files: ['src/sdk/core/http/**/*.ts'],
        rules: {
            'no-restricted-imports': ['error', {
                patterns: [noOclif, noCli, noLegacy, noProducts, corePrimitivesOnly],
            }],
        },
    },

    {
        // Products see the module, not its parts
        files: ['src/sdk/adapty/**/*.ts', 'src/sdk/asa/**/*.ts'],
        rules: { 'no-restricted-imports': ['error', { patterns: [noOclif, noCli, noLegacy, httpDoorOnly] }] },
    },

    {
        // The adapter keeps a few named bridges into src/lib until the commands move over
        files: ['src/cli/**/*.ts'],
        rules: { 'no-restricted-imports': ['error', { patterns: [httpDoorOnly, legacyBridgesOnly] }] },
    },

    {
        // ... plus, for a command, the lib/ it owns
        files: ['src/cli/commands/**/*.ts'],
        rules: { 'no-restricted-imports': ['error', { patterns: [httpDoorOnly, ownCommandLib] }] },
    },
);

export default tseslint.config(
    ...base,
    ...correctness,
    ...typescript,
    ...formatting,
    ...architecture,

    // Configs and scripts live outside tsconfig — type-aware rules have nothing to read
    { files: ['**/*.mjs', '**/*.js'], extends: [tseslint.configs.disableTypeChecked] },
);
