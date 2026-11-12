import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { listFilterFlags, listFilters } from '../../input/hypotheses.js';
import { pageParams, paginationFlags } from '../../input/pagination.js';
import { renderHypothesisPage } from '../../views/hypotheses.js';

import type { Hypothesis, Paginated } from '../../../sdk/adapty/index.js';

export default class HypothesesList extends AdaptyCommand {
    static override description = 'List the hypotheses of an app, with the actions each one allows now';

    static override examples = [
        '<%= config.bin %> hypotheses list --app UUID',
        '<%= config.bin %> hypotheses list --app UUID --placement UUID --state proposed --state accepted',
        '<%= config.bin %> hypotheses list --app UUID --phase testing --order-by -created_at',
    ];

    static override flags = {
        ...appIdFlag,
        ...paginationFlags,
        ...listFilterFlags,
    };

    async run(): Promise<Paginated<Hypothesis>> {
        const { flags } = await this.parse(HypothesesList);

        const page = await this.adapty.hypotheses.list(flags.app, { ...pageParams(flags), ...listFilters(flags) });

        this.render(page, renderHypothesisPage);

        return page;
    }
}
