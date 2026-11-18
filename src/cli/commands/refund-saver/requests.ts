import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { pageParams, paginationFlags } from '../../input/pagination.js';
import { refundPeriodFlags, refundPeriodInput } from '../../input/refund-saver.js';
import { renderPage } from '../../views/list.js';

import type { Paginated, RefundRequest } from '../../../sdk/adapty/index.js';

export default class RefundSaverRequests extends AdaptyCommand {
    static override description = 'List the refund requests that Refund Saver handled in a period, the newest first';

    static override examples = [
        '<%= config.bin %> refund-saver requests --app UUID --date-from 2026-10-01 --date-to 2026-10-31',
        '<%= config.bin %> refund-saver requests --app UUID --date-from 2026-10-01 --date-to 2026-10-31 --store app_store --page 2',
    ];

    static override flags = {
        ...appIdFlag,
        ...refundPeriodFlags,
        ...paginationFlags,
    };

    async run(): Promise<Paginated<RefundRequest>> {
        const { flags } = await this.parse(RefundSaverRequests);
        const input = { ...refundPeriodInput(flags), ...pageParams(flags) };
        const page = await this.adapty.refundSaver.requests(flags.app, input);

        this.render(page, renderPage);

        return page;
    }
}
