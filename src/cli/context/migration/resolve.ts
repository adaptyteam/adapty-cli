import { CliError, exitCode } from '../../errors.js';

import { migrationTokenFingerprint, validateMigrationId } from './model.js';

import type { MigrationSession } from './model.js';
import type { MigrationContextStore } from './store.js';

export type MigrationSelection = {
    currentMigrationId: string;
    source: 'flag' | 'env' | 'context';
};

type ResolutionOptions = {
    migration?: string | undefined;
    envMigration?: string | undefined;
    session: MigrationSession;
    store: Pick<MigrationContextStore, 'load'>;
};

/** Local-only and lazy: an explicit ID never reads context, even if it is broken. */
export const resolveMigrationSelection = async (
    options: ResolutionOptions,
): Promise<MigrationSelection | undefined> => {
    if (options.migration !== undefined) {
        return { currentMigrationId: validateMigrationId(options.migration), source: 'flag' };
    }

    if (options.envMigration !== undefined && options.envMigration !== '') {
        return { currentMigrationId: validateMigrationId(options.envMigration), source: 'env' };
    }

    if (options.session.token === undefined || options.session.token === '') {
        return undefined;
    }

    const context = await options.store.load();

    if (context?.tokenFingerprint !== migrationTokenFingerprint(options.session.token)) {
        return undefined;
    }

    return { currentMigrationId: context.currentMigrationId, source: 'context' };
};

export const requireMigrationSelection = async (options: ResolutionOptions): Promise<MigrationSelection> => {
    const selection = await resolveMigrationSelection(options);

    if (selection === undefined) {
        throw new CliError(
            'No migration selected. Run `adapty migrations list`, then `adapty migrations use <id>`, or supply `-m <id>`.',
            exitCode.usage,
            'migration_required',
        );
    }

    return selection;
};
