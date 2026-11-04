import { Flags } from '@oclif/core';

import { validateMetricsInput } from '../../../../sdk/adapty/index.js';
import { assertValid } from '../../../../sdk/core/validation.js';
import { AdaptyCommand, metricsCsvFlag, depthFlag, metricsInput, metricsQueryFlags, paywallIdArg, requiredDateTypeFlag } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { metricsTreeCsv, renderMetricsTree } from '../../../views/metrics.js';

import type { PaywallMetricsTree } from '../../../../sdk/adapty/index.js';

export default class PaywallsMetricsGet extends AdaptyCommand {
    static override args = { ...paywallIdArg };
    static override description = 'Show the metrics of one paywall for a period, split by placement or audience (the dashboard metrics page)';

    static override examples = [
        '<%= config.bin %> paywalls metrics get PAYWALL_UUID --app APP_UUID --date-from 2026-09-01 --date-to 2026-10-21 --date-type purchase_date --based-on placement',
        '<%= config.bin %> paywalls metrics get PAYWALL_UUID --app APP_UUID --date-from 2026-09-01 --date-to 2026-10-21 --date-type purchase_date --based-on audience --group-by store --granularity month --depth 3',
        '<%= config.bin %> paywalls metrics get PAYWALL_UUID --app APP_UUID --date-from 2026-09-01 --date-to 2026-10-21 --date-type purchase_date --based-on placement --filter country=US,DE --csv',
    ];

    static override flags = {
        ...appIdFlag,
        ...metricsQueryFlags,
        ...requiredDateTypeFlag,
        'based-on': Flags.string({ description: 'What the first level of the tree splits by: placement or audience', required: true }),
        'group-by': Flags.string({ description: 'Group the products by: product, store or country' }),
        ...metricsCsvFlag,
        ...depthFlag,
    };

    async run(): Promise<PaywallMetricsTree> {
        const { args, flags } = await this.parse(PaywallsMetricsGet);
        const input = metricsInput(flags);

        // Before this.adapty: bad input is exit 2 even without a token
        assertValid(validateMetricsInput(input));

        const tree = await this.adapty.paywalls.metrics.get(flags.app, args.paywall_id, input);

        this.render(tree, flags.csv ? metricsTreeCsv : value => renderMetricsTree(value, flags.depth));

        return tree;
    }
}
