import { Flags } from '@oclif/core';

import { validateMetricsInput } from '../../../../sdk/adapty/index.js';
import { assertValid } from '../../../../sdk/core/validation.js';
import { AdaptyCommand, metricsCsvFlag, depthFlag, flowIdArg, metricsInput, metricsQueryFlags, requiredDateTypeFlag } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { metricsTreeCsv, renderMetricsTree } from '../../../views/metrics.js';

import type { MetricsTree } from '../../../../sdk/adapty/index.js';

export default class FlowsMetricsGet extends AdaptyCommand {
    static override args = { ...flowIdArg };
    static override description = 'Show the metrics of one flow for a period, split by placement or audience (the dashboard metrics page)';

    static override examples = [
        '<%= config.bin %> flows metrics get FLOW_UUID --app APP_UUID --date-from 2026-09-01 --date-to 2026-10-21 --date-type purchase_date --based-on placement',
        '<%= config.bin %> flows metrics get FLOW_UUID --app APP_UUID --date-from 2026-09-01 --date-to 2026-10-21 --based-on audience --granularity month --date-type purchase_date --depth 3',
        '<%= config.bin %> flows metrics get FLOW_UUID --app APP_UUID --date-from 2026-09-01 --date-to 2026-10-21 --date-type purchase_date --based-on placement --filter country=US,DE --csv',
    ];

    static override flags = {
        ...appIdFlag,
        ...metricsQueryFlags,
        ...requiredDateTypeFlag,
        'based-on': Flags.string({ description: 'What the first level of the tree splits by: placement or audience', required: true }),
        ...metricsCsvFlag,
        ...depthFlag,
    };

    async run(): Promise<MetricsTree> {
        const { args, flags } = await this.parse(FlowsMetricsGet);
        const input = metricsInput(flags);

        // Before this.adapty: bad input is exit 2 even without a token
        assertValid(validateMetricsInput(input));

        const tree = await this.adapty.flows.metrics.get(flags.app, args.flow_id, input);

        this.render(tree, flags.csv ? metricsTreeCsv : value => renderMetricsTree(value, flags.depth));

        return tree;
    }
}
