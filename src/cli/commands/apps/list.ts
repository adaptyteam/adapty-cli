import { AdaptyCommand } from '../../base/adapty/index.js';
import { pageParams, paginationFlags } from '../../flags.js';
import { renderPage } from '../../views/list.js';

import type { AppSummary, Paginated } from '../../../sdk/adapty/index.js';

export default class AppsList extends AdaptyCommand {
    static override description = 'List Adapty apps';
    static override examples = ['<%= config.bin %> apps list', '<%= config.bin %> apps list --page 2 --page-size 10'];
    static override flags = { ...paginationFlags };

    async run(): Promise<Paginated<AppSummary>> {
        const { flags } = await this.parse(AppsList);
        const page = await this.adapty.apps.list(pageParams(flags));

        this.render(page, renderPage);

        return page;
    }
}
