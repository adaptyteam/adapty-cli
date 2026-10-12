import { Flags } from '@oclif/core';

import { conversionIds, validateConversion } from '../../../sdk/adapty/index.js';
import { assertValid } from '../../../sdk/core/validation.js';
import {
    AdaptyCommand,
    analyticsFilterFlags,
    analyticsPeriodFlags,
    analyticsQueryParams,
    compareFlags,
    csvFlag,
    granularityFlag,
    groupByFlag,
} from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { analyticsView } from '../../views/analytics/segments.js';

import type { ConversionInput, ConversionResponse } from '../../../sdk/adapty/index.js';

export default class AnalyticsConversion extends AdaptyCommand {
    static override description = 'Read one conversion of the analytics of an app (install → trial, trial → paid, ...): '
        + 'the rate in percent with its two counts, per point and per group, the total first';

    static override examples = [
        '<%= config.bin %> analytics conversion --app APP_UUID --conversion trial-paid --date-from 2026-07-01 --date-to 2026-09-30',
        '<%= config.bin %> analytics conversion --app APP_UUID --conversion install-paid --date-from 2026-07-01 --date-to 2026-09-30 --granularity month --group-by country --csv',
    ];

    static override flags = {
        ...appIdFlag,
        conversion: Flags.option({
            description: 'The conversion, as `adapty analytics catalog` lists it',
            options: conversionIds,
            required: true,
        })(),
        ...analyticsPeriodFlags,
        ...compareFlags,
        ...groupByFlag,
        ...analyticsFilterFlags,
        ...granularityFlag('The period of one point (default day)'),
        ...csvFlag,
    };

    async run(): Promise<ConversionResponse> {
        const { flags } = await this.parse(AnalyticsConversion);

        const input: ConversionInput = {
            ...analyticsQueryParams(flags),
            compareFrom: flags['compare-from'],
            compareTo: flags['compare-to'],
            conversionId: flags.conversion,
            granularity: flags.granularity,
            groupBy: flags['group-by'],
        };

        // Before this.adapty: bad input is exit 2 even without a token
        assertValid(validateConversion(input));

        const answer = await this.adapty.analytics.conversion(input);

        this.render(answer, analyticsView(flags.csv));

        return answer;
    }
}
