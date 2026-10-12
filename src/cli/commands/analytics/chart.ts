import { Flags } from '@oclif/core';

import { chartIds, validateChart } from '../../../sdk/adapty/index.js';
import { assertValid } from '../../../sdk/core/validation.js';
import {
    AdaptyCommand,
    analyticsFilterFlags,
    analyticsPeriodFlags,
    analyticsQueryParams,
    analyticsRevenueBasisFlag,
    compareFlags,
    csvFlag,
    granularityFlag,
    groupByFlag,
} from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { analyticsView } from '../../views/analytics/segments.js';

import type { ChartInput, ChartResponse } from '../../../sdk/adapty/index.js';

export default class AnalyticsChart extends AdaptyCommand {
    static override description = 'Read one chart of the analytics of an app (revenue, MRR, installs, ...): '
        + 'the number of the period, its points and its groups, the total first';

    static override examples = [
        '<%= config.bin %> analytics chart --app APP_UUID --chart revenue --date-from 2026-07-01 --date-to 2026-09-30',
        '<%= config.bin %> analytics chart --app APP_UUID --chart revenue --date-from 2026-07-01 --date-to 2026-09-30 --group-by country --csv',
        '<%= config.bin %> analytics chart --app APP_UUID --chart mrr --date-from 2026-07-01 --date-to 2026-09-30 --compare-from 2026-04-01 --compare-to 2026-06-30 --json',
    ];

    static override flags = {
        ...appIdFlag,
        chart: Flags.option({
            description: 'The chart, as `adapty analytics catalog` lists it',
            options: chartIds,
            required: true,
        })(),
        ...analyticsPeriodFlags,
        ...compareFlags,
        ...groupByFlag,
        ...analyticsFilterFlags,
        ...granularityFlag('The period of one point (default month)'),
        ...analyticsRevenueBasisFlag,
        ...csvFlag,
    };

    async run(): Promise<ChartResponse> {
        const { flags } = await this.parse(AnalyticsChart);

        const input: ChartInput = {
            ...analyticsQueryParams(flags),
            chartId: flags.chart,
            compareFrom: flags['compare-from'],
            compareTo: flags['compare-to'],
            granularity: flags.granularity,
            groupBy: flags['group-by'],
            revenueBasis: flags['revenue-basis'],
        };

        // Before this.adapty: bad input is exit 2 even without a token
        assertValid(validateChart(input));

        const answer = await this.adapty.analytics.chart(input);

        this.render(answer, analyticsView(flags.csv));

        return answer;
    }
}
