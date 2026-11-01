import { abTestTypeFlag, AdaptyCommand } from '../../../base/adapty/index.js';
import { abTestIdArg } from '../../../input/ab-tests.js';
import { appIdFlag } from '../../../input/app.js';
import { renderFilterValues } from '../../../views/metrics.js';

import type { FilterValues } from '../../../../sdk/adapty/index.js';

export default class AbTestsMetricsValues extends AdaptyCommand {
    static override args = { ...abTestIdArg };
    static override description = 'List the filter values of an A/B test: the keys and values that `ab-tests metrics get --filter key=value` takes';

    static override examples = [
        '<%= config.bin %> ab-tests metrics values TEST_UUID --app APP_UUID --type paywall',
        '<%= config.bin %> ab-tests metrics values TEST_UUID --app APP_UUID --type flow --json',
    ];

    static override flags = {
        ...appIdFlag,
        ...abTestTypeFlag,
    };

    async run(): Promise<FilterValues> {
        const { args, flags } = await this.parse(AbTestsMetricsValues);
        const values = await this.adapty.abTests.metrics.values(flags.app, args.ab_test_id, flags.type);

        this.render(values, renderFilterValues);

        return values;
    }
}
