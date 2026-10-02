import { Args, Flags } from '@oclif/core';

import { validateMigrationId } from '../context/migration/index.js';

export const migrationArgs = {
    id: Args.string({
        description: 'Migration ID from `adapty migrations list`',
        required: true,
        parse: value => Promise.resolve(validateMigrationId(value)),
    }),
};

/** Explicit ID wins over the environment and the saved selection, resolved after parsing. */
export const migrationFlags = {
    migration: Flags.string({
        char: 'm',
        description: 'Migration ID; overrides ADAPTY_MIGRATION and the saved selection from migrations use/create',
        helpValue: 'ID',
    }),
};
