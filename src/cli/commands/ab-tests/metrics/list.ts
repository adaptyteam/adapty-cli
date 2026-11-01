import { abTestIdsFlag, abTestTypeFlag, AdaptyCommand, metricsCsvFlag } from '../../../base/adapty/index.js';
import { metricsNumbersHelp } from '../../../input/ab-tests.js';
import { appIdFlag } from '../../../input/app.js';
import { abTestRowsCsv, renderAbTestRows } from '../../../views/ab-tests/metrics.js';

import type { AbTestMetricsRows } from '../../../../sdk/adapty/index.js';

export default class AbTestsMetricsList extends AdaptyCommand {
    static override description = 'Show the lifetime metrics of several A/B tests, a Total line for each test and a line for each arm (the dashboard A/B tests list). '
        + `${metricsNumbersHelp.notComputed}${metricsNumbersHelp.pValue} `
        + 'A paywall test arm carries only the mean of the range, no low and no high';

    static override examples = [
        '<%= config.bin %> ab-tests metrics list --app APP_UUID --type paywall --ids TEST_UUID,TEST_UUID',
        '<%= config.bin %> ab-tests metrics list --app APP_UUID --type flow --ids TEST_UUID --csv',
    ];

    static override flags = {
        ...appIdFlag,
        ...abTestTypeFlag,
        ...abTestIdsFlag,
        ...metricsCsvFlag,
    };

    async run(): Promise<AbTestMetricsRows> {
        const { flags } = await this.parse(AbTestsMetricsList);
        const rows = await this.adapty.abTests.metrics.list(flags.app, flags.type, flags.ids);

        this.render(rows, flags.csv ? abTestRowsCsv : renderAbTestRows);

        return rows;
    }
}
