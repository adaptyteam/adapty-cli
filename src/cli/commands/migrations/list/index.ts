import { AdaptyCommand } from '../../../base/adapty/index.js';

import { renderMigrationList } from './lib/render.js';

import type { MigrationList } from '../../../../sdk/adapty/index.js';

export default class List extends AdaptyCommand {
    static override description = 'List migrations and the flows you can start';
    static override examples = ['<%= config.bin %> migrations list'];

    async run(): Promise<MigrationList> {
        await this.parse(List);

        const list = await this.adapty.migrations.list();
        this.render(list, renderMigrationList);

        return list;
    }
}
