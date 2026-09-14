import { Args } from '@oclif/core';

import { AdaptyCommand } from '../../../base/adapty/index.js';
import { migrationFlags } from '../../../flags.js';

import type { Envelope } from '../../../../sdk/adapty/index.js';

export default class Show extends AdaptyCommand {
    static override description = 'Read the data behind a migration: apps, mapping, report';

    static override examples = [
        '<%= config.bin %> migrations show',
        '<%= config.bin %> migrations show mapping',
        '<%= config.bin %> migrations show report -m mig_7x2',
    ];

    static override args = {
        resource: Args.string({
            description: 'Resource name; omit to list what can be read now',
        }),
    };

    static override flags = { ...migrationFlags };

    async run(): Promise<Envelope> {
        await this.parse(Show);

        // TODO: without the arg render resources[] from the envelope; with it GET the resource and
        // render result — a table for a collection, text for { markdown }, JSON for anything else.
        throw new Error('`adapty migrations show` is not implemented yet');
    }
}
