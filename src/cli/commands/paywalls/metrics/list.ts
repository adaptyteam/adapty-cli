import { AdaptyCommand, metricsCsvFlag, paywallIdsFlag } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { metricsRowsCsv, renderMetricsRows } from '../../../views/metrics.js';

import type { PaywallMetricsRows } from '../../../../sdk/adapty/index.js';

export default class PaywallsMetricsList extends AdaptyCommand {
    static override description = 'Show the lifetime metrics of several paywalls, one row for each (the dashboard paywalls table)';

    static override examples = [
        '<%= config.bin %> paywalls metrics list --app APP_UUID --ids PAYWALL_UUID,PAYWALL_UUID',
        '<%= config.bin %> paywalls metrics list --app APP_UUID --ids PAYWALL_UUID --csv',
    ];

    static override flags = {
        ...appIdFlag,
        ...paywallIdsFlag,
        ...metricsCsvFlag,
    };

    async run(): Promise<PaywallMetricsRows> {
        const { flags } = await this.parse(PaywallsMetricsList);
        const rows = await this.adapty.paywalls.metrics.list(flags.app, flags.ids);
        const view = flags.csv ? metricsRowsCsv : renderMetricsRows;

        this.render(rows, value => view(value, 'paywall_id'));

        return rows;
    }
}
