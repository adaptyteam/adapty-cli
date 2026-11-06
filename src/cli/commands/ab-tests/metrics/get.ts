import { Flags } from '@oclif/core';

import { validateMetricsInput } from '../../../../sdk/adapty/index.js';
import { assertValid } from '../../../../sdk/core/validation.js';
import {
    abTestTypeFlag,
    AdaptyCommand,
    dateTypeFlag,
    depthFlag,
    metricsCsvFlag,
    metricsInput,
    metricsQueryFlags,
} from '../../../base/adapty/index.js';
import { abTestIdArg, metricsNumbersHelp } from '../../../input/ab-tests.js';
import { appIdFlag } from '../../../input/app.js';
import { abTestDetailCsv, renderAbTestDetail } from '../../../views/ab-tests/metrics.js';

import type { AbTestMetricsDetail } from '../../../../sdk/adapty/index.js';

export default class AbTestsMetricsGet extends AdaptyCommand {
    static override args = { ...abTestIdArg };
    static override description = 'Show the metrics of one A/B test for a period, by period, with the arms and what is under them '
        + '(the dashboard results page). '
        + 'The P2BB of a period is a running total from the start of the window for a paywall test (it holds on days with no views) and the value of that period '
        + 'for a flow test; it is never the P2BB of the arm: read the leader in `ab-tests metrics total`. '
        + `${metricsNumbersHelp.notComputed}${metricsNumbersHelp.range}${metricsNumbersHelp.pValue} `
        + 'Views are counted by the view date; --date-type is purchase_date or profile_install_date, and views are the same with either. '
        + 'A paywall test needs --date-from, --date-to and --date-type; a flow test without a date gives the lifetime numbers';

    static override examples = [
        '<%= config.bin %> ab-tests metrics get TEST_UUID --app APP_UUID --type paywall --date-from 2026-09-01 --date-to 2026-10-21 --date-type purchase_date',
        '<%= config.bin %> ab-tests metrics get TEST_UUID --app APP_UUID --type flow --group-by country --date-from 2026-09-01 --date-to 2026-10-21 --date-type purchase_date',
        '<%= config.bin %> ab-tests metrics get TEST_UUID --app APP_UUID --type flow --csv',
    ];

    static override flags = {
        ...appIdFlag,
        ...abTestTypeFlag,
        ...metricsQueryFlags,
        ...dateTypeFlag,
        'group-by': Flags.string({ description: 'Split each arm by: country or store (product is the default)' }),
        ...metricsCsvFlag,
        ...depthFlag,
    };

    async run(): Promise<AbTestMetricsDetail> {
        const { args, flags } = await this.parse(AbTestsMetricsGet);
        const input = metricsInput(flags);

        // Before this.adapty: bad input is exit 2 even without a token
        assertValid(validateMetricsInput(input));

        const detail = await this.adapty.abTests.metrics.get(flags.app, args.ab_test_id, flags.type, input);

        this.render(detail, flags.csv ? abTestDetailCsv : value => renderAbTestDetail(value, flags.depth));

        return detail;
    }
}
