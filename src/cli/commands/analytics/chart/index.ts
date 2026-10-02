import { Args, Flags } from '@oclif/core';

import { periodUnits, validateChart } from '../../../../sdk/adapty/index.js';
import { assertValid } from '../../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../../base/adapty/index.js';
import { appIdFlag, parseDimensionFilter, periodFlags, periodParams, revenueBasisFlag } from '../../../flags.js';

import { renderChart, renderCsv } from './lib/render.js';

import type { ChartFilter, ChartInput, ChartResponse } from '../../../../sdk/adapty/index.js';

export default class AnalyticsChart extends AdaptyCommand {
    static override args = {
        'chart-id': Args.string({
            description: 'Chart id, as `adapty analytics charts` lists it (e.g. revenue, mrr, installs)',
            required: true,
        }),
    };

    static override description = 'Read one dashboard chart for an app over a period, optionally broken down by one dimension';

    static override examples = [
        '<%= config.bin %> analytics chart revenue --app APP_UUID --date-from 2026-09-01 --date-to 2026-09-28 --granularity week',
        '<%= config.bin %> analytics chart revenue --app APP_UUID --date-from 2026-09-01 --date-to 2026-09-28 --segment-by country --filter store=play_store --revenue-basis net',
        '<%= config.bin %> analytics chart subscriptions_active --app APP_UUID --date-from 2026-01-01 --date-to 2026-09-30 --csv',
    ];

    // Input shape here; the rules (dates in order, each filter dimension once) live in
    // sdk/adapty/analytics/chart.ts, and which charts and dimensions exist is the server's knowledge.
    static override flags = {
        ...appIdFlag,
        ...periodFlags,
        'granularity': Flags.option({
            description: 'Period of each column; the server default (month) applies when omitted',
            options: periodUnits,
        })(),
        'segment-by': Flags.string({
            description: 'Break the chart down by one dimension, as `adapty analytics charts` lists it for the chart',
        }),
        'filter': Flags.custom<ChartFilter>({
            description: 'Keep data whose dimension has one of the values: dimension=value[,value] (repeatable, once per dimension; `\\,` for a comma inside a value)',
            multiple: true,
            parse: parseDimensionFilter,
        })(),
        ...revenueBasisFlag,
        'csv': Flags.boolean({
            description: 'Print the chart as CSV: segment,total,<period start>...',
            exclusive: ['json'],
        }),
    };

    async run(): Promise<ChartResponse> {
        const { args, flags } = await this.parse(AnalyticsChart);

        const input: ChartInput = {
            appId: flags.app,
            chartId: args['chart-id'],
            ...periodParams(flags),
            filters: flags.filter,
            periodUnit: flags.granularity,
            revenueBasis: flags['revenue-basis'],
            segmentation: flags['segment-by'],
        };

        // Before this.adapty: bad input is exit 2 even without a token
        assertValid(validateChart(input));

        const chart = await this.adapty.analytics.chart(input);

        this.render(chart, flags.csv ? renderCsv : renderChart);

        return chart;
    }
}
