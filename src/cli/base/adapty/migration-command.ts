import { openCurrentMigration } from '../../context/migration/index.js';

import { AdaptyCommand } from './adapty-command.js';

import type { CurrentMigration } from '../../context/migration/index.js';

/**
 * `AdaptyCommand` plus the saved migration selection. One topic out of ten stays a base of its own
 * rather than a getter on `AdaptyCommand`, where all 75 commands would pay for it.
 */
export abstract class MigrationCommand extends AdaptyCommand {
    #current: CurrentMigration | undefined;

    /** A getter, not a field: field initializers run in the constructor, before init() has a session. */
    protected get currentMigration(): CurrentMigration {
        this.#current ??= openCurrentMigration({
            configDir: this.config.configDir,
            session: this.resolvedSession,
        });

        return this.#current;
    }
}
