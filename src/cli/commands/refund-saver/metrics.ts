import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { refundPeriodFlags, refundPeriodInput } from '../../input/refund-saver.js';
import { renderMetrics } from '../../views/refund-saver/metrics.js';

import type { RefundMetrics } from '../../../sdk/adapty/index.js';

export default class RefundSaverMetrics extends AdaptyCommand {
    static override description = 'Show what Refund Saver saved in a period: the saved and the requested amounts in whole USD, '
        + 'their counts and the win rate in percent';

    static override examples = ['<%= config.bin %> refund-saver metrics --app UUID --date-from 2026-10-01 --date-to 2026-10-31 --store play_store'];
    static override flags = { ...appIdFlag, ...refundPeriodFlags };

    async run(): Promise<RefundMetrics> {
        const { flags } = await this.parse(RefundSaverMetrics);
        const metrics = await this.adapty.refundSaver.metrics(flags.app, refundPeriodInput(flags));

        this.render(metrics, renderMetrics);

        return metrics;
    }
}
