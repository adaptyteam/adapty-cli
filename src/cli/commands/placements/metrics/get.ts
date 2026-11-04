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

import type { MetricsTree, PaywallMetricsTree } from '../../../../sdk/adapty/index.js';

export default class PlacementsMetricsGet extends AdaptyCommand {
    static override args = { ...placementIdArg };
    static override description = 'Show the metrics of one flow placement or paywall placement (the dashboard metrics page). A flow placement: lifetime or for a period, split by flow, audience or placement. A paywall placement: for a period, split by audience or paywall';

    static override examples = [
        '<%= config.bin %> placements metrics get PLACEMENT_UUID --app APP_UUID --type flow --based-on flow',
        '<%= config.bin %> placements metrics get PLACEMENT_UUID --app APP_UUID --type flow --based-on audience --group-by country --date-from 2026-09-01 --date-to 2026-10-21 --date-type purchase_date',
        '<%= config.bin %> placements metrics get PLACEMENT_UUID --app APP_UUID --type flow --based-on flow --csv',
        '<%= config.bin %> placements metrics get PLACEMENT_UUID --app APP_UUID --type paywall --based-on audience --date-from 2026-09-01 --date-to 2026-10-21 --date-type purchase_date',
    ];

    static override flags = {
        ...appIdFlag,
        ...placementTypeFlag,
        ...metricsQueryFlags,
        ...dateTypeFlag,
        'based-on': Flags.string({ description: 'What the first level of the tree splits by: audience, flow or placement for a flow placement; audience or paywall for a paywall placement', required: true }),
        'group-by': Flags.string({ description: 'Group by: country or store for a flow placement; product, store or country for a paywall placement' }),
        ...metricsCsvFlag,
        ...depthFlag,
    };

    async run(): Promise<MetricsTree | PaywallMetricsTree> {
        const { args, flags } = await this.parse(PlacementsMetricsGet);
        const input = metricsInput(flags);

        // Before this.adapty: bad input is exit 2 even without a token
        assertValid(validateMetricsInput(input));

        const tree = await this.adapty.placements.metrics.get(flags.app, args.placement_id, flags.type, input);

        this.render(tree, flags.csv ? metricsTreeCsv : value => renderMetricsTree(value, flags.depth));

        return tree;
    }
}
