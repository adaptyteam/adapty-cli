import { Flags } from '@oclif/core';

import { AdaptyCommand } from '../../../base/adapty/index.js';
import { migrationFlags } from '../../../flags.js';

import type { Envelope } from '../../../../sdk/adapty/index.js';

export default class Close extends AdaptyCommand {
    static override description = 'Finish a migration or cancel it for good';

    static override examples = [
        '<%= config.bin %> migrations close --outcome finish --yes',
        '<%= config.bin %> migrations close --outcome cancel --yes -m mig_7x2',
    ];

    static override flags = {
        ...migrationFlags,
        outcome: Flags.option({
            description: 'Finish — mark the migration as completed; Cancel — abandon the migration.',
            options: ['finish', 'cancel'] as const,
            required: true,
        })(),
        // Closing is final and never appears in next_actions, so there is nothing to preview:
        // the agreement is the flag itself, required even on a TTY.
        yes: Flags.boolean({
            char: 'y',
            description: 'Confirm closing: it is final and never asked for again',
            required: true,
        }),
    };

    async run(): Promise<Envelope> {
        await this.parse(Close);

        // TODO: resolve the migration id, POST close with the outcome and expected_revision from a
        // fresh envelope, then render what came back.
        throw new Error('`adapty migrations close` is not implemented yet');
    }
}
