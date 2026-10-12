import { Flags } from '@oclif/core';

import { chartIds, validateChart } from '../../../sdk/adapty/index.js';
import { assertValid } from '../../../sdk/core/validation.js';
import {
    AdaptyCommand,
    compareFlags,
    compareParams,
    csvFlag,
    filterFlags,
    granularityFlag,
    groupByFlag,
    groupingParams,
    periodFlags,
    queryParams,
    revenueBasisFlag,
} from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { analyticsView, csvNotice } from '../../views/analytics/segments.js';

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
        ...periodFlags,
        ...compareFlags,
        ...groupByFlag,
        ...filterFlags,
        ...granularityFlag('The period of one point (default month)'),
        ...revenueBasisFlag,
        ...csvFlag,
    };

    async run(): Promise<ChartResponse> {
        const { flags } = await this.parse(AnalyticsChart);

        const input: ChartInput = {
            ...queryParams(flags),
            chartId: flags.chart,
            ...compareParams(flags),
            ...groupingParams(flags),
            revenueBasis: flags['revenue-basis'],
        };

        // Before this.adapty: bad input is exit 2 even without a token
        assertValid(validateChart(input));

        const answer = await this.adapty.analytics.chart(input);

        this.render(answer, analyticsView(flags.csv));
        // Beside a CSV of a period without data, its summary; an empty text otherwise
        process.stderr.write(csvNotice(answer, flags.csv));

        return answer;
    }
}
