import { AdaptyCommand } from '../../../base/adapty/index.js';

import { renderMigrationList } from './lib/render.js';

import type { MigrationList } from '../../../../sdk/adapty/index.js';

export default class List extends AdaptyCommand {
    static override summary = 'List migrations and the flows you can start';
    static override description = [
        'Use a migration ID with `adapty migrations status -m ID` to continue an existing flow.',
        'Start an available flow with `adapty migrations create --flow FLOW --app APP_ID`.',
        '',
        'With --json, items contains migrations and available contains flows with their target apps.',
    ].join('\n');

    static override examples = [
        {
            description: 'Find migrations and available flows, grouped by app:',
            command: '<%= config.bin %> migrations list',
        },
        {
            description: 'Read migration IDs and available flows as JSON:',
            command: '<%= config.bin %> migrations list --json',
        },
    ];

    async run(): Promise<MigrationList> {
        await this.parse(List);

        const list = await this.adapty.migrations.list();
        this.render(list, renderMigrationList);

        return list;
    }
}
