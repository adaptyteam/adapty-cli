import { Args } from '@oclif/core';

import { AdaptyCommand } from '../../../base/adapty/index.js';
import { migrationFlags } from '../../../input/migration.js';

import { renderResources, renderResult } from './lib/render.js';

import type { Envelope } from '../../../../sdk/adapty/index.js';

export default class Show extends AdaptyCommand {
    static override summary = 'List migration resources or read one resource';
    static override description = [
        'Omit RESOURCE to list what can be read now. Use a name from that list, such as apps, mapping, or report.',
        '',
        'Reading a resource prints its data as JSON. With --json, returns the full migration response.',
        'Resource data is in result (null if no data is available yet).',
    ].join('\n');

    static override examples = [
        {
            description: 'List resource names available now:',
            command: '<%= config.bin %> migrations show -m mig_7x2',
        },
        {
            description: 'Read mapping data, if listed as available:',
            command: '<%= config.bin %> migrations show mapping -m mig_7x2',
        },
        {
            description: 'Extract only the resource data (requires jq):',
            command: '<%= config.bin %> migrations show mapping -m mig_7x2 --json | jq \'.result\'',
        },
    ];

    static override args = {
        resource: Args.string({
            description: 'Resource name; omit to list what can be read now',
        }),
    };

    static override flags = { ...migrationFlags };

    async run(): Promise<Envelope> {
        const { args, flags } = await this.parse(Show);
        const { resource } = args;

        const envelope = resource === undefined
            ? await this.adapty.migrations.get(flags.migration)
            : await this.adapty.migrations.resource(flags.migration, resource);

        this.render(envelope, resource === undefined ? renderResources : renderResult);

        return envelope;
    }
}
