import { AuthRequiredError } from '../../../sdk/core/errors.js';

import { createMigrationContext, migrationTokenFingerprint } from './model.js';
import { requireMigrationSelection, resolveMigrationSelection } from './resolve.js';
import { createMigrationContextStore } from './store.js';

import type { MigrationSession } from './model.js';
import type { MigrationSelection } from './resolve.js';

/**
 * Everything a command may ask about "which migration am I on", behind verbs. The file, the token
 * that scopes it and ADAPTY_MIGRATION are put together here, once, and not in every `run()`.
 */
export type CurrentMigration = {
    /** Unconditional: `unuse` and `logout` remove a record they may not even be able to read. */
    clear(): Promise<void>;
    /**
     * Only if the record belongs to this token: another token's selection stays usable — with
     * ADAPTY_TOKEN set, the file may hold a different, still-valid one. The check is not atomic,
     * and nothing here can make it so: a concurrent `login` landing between the read and the
     * remove loses its fresh record. That costs one more `adapty auth login`, never a selection
     * left behind for a dead token, so the file keeps the same last-writer-wins rule as `save`.
     */
    clearFor(token: string): Promise<void>;
    get(explicit?: string): Promise<MigrationSelection | undefined>;
    /** ADAPTY_MIGRATION is set, so neither a save nor a clear changes what the next command uses. */
    readonly overridden: boolean;
    readonly path: string;
    require(explicit?: string): Promise<MigrationSelection>;
    set(id: string): Promise<void>;
};

export type CurrentMigrationOptions = {
    configDir: string;
    /** The one place ADAPTY_MIGRATION is read; a parameter so a test needs no global. */
    env?: NodeJS.ProcessEnv | undefined;
    /** Absent for `unuse`, tokenless for `current`: neither needs credentials to answer. */
    session?: MigrationSession | undefined;
};

export const openCurrentMigration = (options: CurrentMigrationOptions): CurrentMigration => {
    const store = createMigrationContextStore(options.configDir);
    const session = options.session ?? {};
    const envMigration = (options.env ?? process.env).ADAPTY_MIGRATION;
    const sources = { envMigration, session, store };

    return {
        overridden: envMigration !== undefined && envMigration !== '',
        path: store.path,

        clear: () => store.clear(),

        clearFor: async (token) => {
            const stored = await store.load();

            if (stored?.tokenFingerprint === migrationTokenFingerprint(token)) {
                await store.clear();
            }
        },

        get: explicit => resolveMigrationSelection({ ...sources, migration: explicit }),

        require: explicit => requireMigrationSelection({ ...sources, migration: explicit }),

        set: async (id) => {
            const { token } = session;

            if (token === undefined || token === '') {
                throw new AuthRequiredError('missing');
            }

            await store.save(createMigrationContext({ ...session, token }, id));
        },
    };
};
