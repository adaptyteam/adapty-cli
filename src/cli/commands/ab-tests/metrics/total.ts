import { abTestTypeFlag, AdaptyCommand } from '../../../base/adapty/index.js';
import { abTestIdArg, metricsNumbersHelp } from '../../../input/ab-tests.js';
import { appIdFlag } from '../../../input/app.js';
import { renderAbTestTotal } from '../../../views/ab-tests/metrics.js';

import type { AbTestMetricsTotal } from '../../../../sdk/adapty/index.js';

export default class AbTestsMetricsTotal extends AdaptyCommand {
    static override args = { ...abTestIdArg };
    static override description = 'Show the numbers of each arm of an A/B test over its whole life: weight, revenue, P2BB, the range, '
        + 'and the p-value of a flow test. Read the leader here before a stop, never in a period of `get`. '
        + `${metricsNumbersHelp.notComputed}${metricsNumbersHelp.range}${metricsNumbersHelp.pValue}`;

    static override examples = [
        '<%= config.bin %> ab-tests metrics total TEST_UUID --app APP_UUID --type flow',
        '<%= config.bin %> ab-tests metrics total TEST_UUID --app APP_UUID --type paywall --json',
    ];

    static override flags = {
        ...appIdFlag,
        ...abTestTypeFlag,
    };

    async run(): Promise<AbTestMetricsTotal> {
        const { args, flags } = await this.parse(AbTestsMetricsTotal);
        const total = await this.adapty.abTests.metrics.total(flags.app, args.ab_test_id, flags.type);

        this.render(total, renderAbTestTotal);

        return total;
    }
}
