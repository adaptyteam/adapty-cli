import { Flags } from '@oclif/core';

import { validateMetricsInput } from '../../../../sdk/adapty/index.js';
import { assertValid } from '../../../../sdk/core/validation.js';
import { AdaptyCommand, metricsCsvFlag, depthFlag, flowIdArg, metricsInput, metricsQueryFlags, requiredDateTypeFlag } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { NEVER_PUBLISHED } from '../../../views/flow-versions.js';
import { metricsTreeCsv, renderMetricsTree } from '../../../views/metrics.js';

import type { MetricsTree } from '../../../../sdk/adapty/index.js';

/** The tree as the server gives it; `note` only when the flow was never published: no data is behind the numbers. */
export type FlowMetricsAnswer = MetricsTree & { note?: 'never_published' };

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

    async run(): Promise<FlowMetricsAnswer> {
        const { args, flags } = await this.parse(FlowsMetricsGet);
        const input = metricsInput(flags);

        // Before this.adapty: bad input is exit 2 even without a token
        assertValid(validateMetricsInput(input));

        // The numbers of a flow that was never published are zeros, not results: the flow says which it is.
        // Both reads go at once; a flow that cannot be read gives the numbers with no note
        const [tree, unpublished] = await Promise.all([
            this.adapty.flows.metrics.get(flags.app, args.flow_id, input),
            this.adapty.flows.neverPublished(flags.app, [args.flow_id]),
        ]);

        const neverPublished = unpublished.has(args.flow_id);
        const answer: FlowMetricsAnswer = neverPublished ? { ...tree, note: 'never_published' } : tree;

        if (flags.csv) {
            // The note goes to stderr: stdout stays a CSV
            if (neverPublished && !this.jsonEnabled()) {
                this.logToStderr(NEVER_PUBLISHED);
            }

            this.render(answer, metricsTreeCsv);
        } else {
            const note = neverPublished ? [NEVER_PUBLISHED] : [];

            this.render(answer, value => [...note, renderMetricsTree(value, flags.depth)].join('\n'));
        }

        return answer;
    }
}
