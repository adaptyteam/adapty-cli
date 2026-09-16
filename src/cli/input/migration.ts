import { Flags } from '@oclif/core';

/** Require an explicit migration ID, supplied by the flag or ADAPTY_MIGRATION. */
export const migrationFlags = {
    migration: Flags.string({
        char: 'm',
        description: 'ID from `adapty migrations list`; overrides ADAPTY_MIGRATION. No automatic selection',
        env: 'ADAPTY_MIGRATION',
        helpValue: 'ID',
        required: true,
    }),
};
