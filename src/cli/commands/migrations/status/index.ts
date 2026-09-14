import { Flags } from '@oclif/core';

import { AdaptyCommand } from '../../../base/adapty/index.js';
import { migrationFlags } from '../../../flags.js';

import type { Envelope } from '../../../../sdk/adapty/index.js';

export default class Status extends AdaptyCommand {
    static override description = 'Show where a migration is and what it needs from you';

    static override examples = [
        '<%= config.bin %> migrations status',
        '<%= config.bin %> migrations status -m mig_7x2',
        '<%= config.bin %> migrations status --wait 300s',
    ];

    static override flags = {
        ...migrationFlags,
        // oclif has no optional-value flag, so the contract's bare `--wait` cannot be declared as
        // it is written: a string flag always demands a value. Either the duration stays required
        // here, or run() reads the default (120s, max 600s) for a bare `--wait` on its own.
        wait: Flags.string({
            description: 'Wait until the migration changes, e.g. 300s (default 120s, max 600s)',
        }),
    };

    async run(): Promise<Envelope> {
        await this.parse(Status);

        // TODO: resolve the migration id, GET the envelope (polling every poll_after_seconds while
        // --wait is on, progress to stderr) and render it. A failed migration is still exit 0.
        throw new Error('`adapty migrations status` is not implemented yet');
    }
}
