import { Flags } from '@oclif/core';

import { validateMetricsInput } from '../../../../sdk/adapty/index.js';
import { assertValid } from '../../../../sdk/core/validation.js';
import {
    AdaptyCommand,
    metricsCsvFlag,
    dateTypeFlag,
    depthFlag,
    metricsInput,
    metricsQueryFlags,
    placementIdArg,
    placementTypeFlag,
} from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { metricsTreeCsv, renderMetricsTree } from '../../../views/metrics.js';

import type { MetricsTree } from '../../../../sdk/adapty/index.js';

export default class PlacementsMetricsGet extends AdaptyCommand {
    static override args = { ...placementIdArg };
    static override description = 'Show the metrics of one flow placement, lifetime or for a period, split by flow, audience or placement (the dashboard metrics page)';

    static override examples = [
        '<%= config.bin %> placements metrics get PLACEMENT_UUID --app APP_UUID --type flow --based-on flow',
        '<%= config.bin %> placements metrics get PLACEMENT_UUID --app APP_UUID --type flow --based-on audience --group-by country --date-from 2026-09-01 --date-to 2026-10-21 --date-type purchase_date',
        '<%= config.bin %> placements metrics get PLACEMENT_UUID --app APP_UUID --type flow --based-on flow --csv',
    ];

    static override flags = {
        ...appIdFlag,
        ...placementTypeFlag,
        ...metricsQueryFlags,
        ...dateTypeFlag,
        'based-on': Flags.string({ description: 'What the first level of the tree splits by: audience, flow or placement', required: true }),
        'group-by': Flags.string({ description: 'Split each audience by: country or store' }),
        ...metricsCsvFlag,
        ...depthFlag,
    };

    async run(): Promise<MetricsTree> {
        const { args, flags } = await this.parse(PlacementsMetricsGet);
        const input = metricsInput(flags);

        // Before this.adapty: bad input is exit 2 even without a token
        assertValid(validateMetricsInput(input));

        const tree = await this.adapty.placements.metrics.get(flags.app, args.placement_id, flags.type, input);

        this.render(tree, flags.csv ? metricsTreeCsv : value => renderMetricsTree(value, flags.depth));

        return tree;
    }
}
