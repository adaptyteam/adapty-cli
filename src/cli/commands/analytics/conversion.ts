import { Flags } from '@oclif/core';

import { validateConversion } from '../../../sdk/adapty/index.js';
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
} from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { analyticsView, conversionTable } from '../../views/analytics/human.js';
import { csvNotice } from '../../views/analytics/segments.js';

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
        conversion: Flags.string({
            description: 'The conversion, as `adapty analytics catalog` lists it',
            required: true,
        }),
        ...periodFlags,
        ...compareFlags,
        ...groupByFlag,
        ...filterFlags,
        ...granularityFlag('The period of one point (default day)'),
        ...csvFlag,
    };

    async run(): Promise<ConversionResponse> {
        const { flags } = await this.parse(AnalyticsConversion);

        const input: ConversionInput = {
            ...queryParams(flags),
            ...compareParams(flags),
            conversionId: flags.conversion,
            ...groupingParams(flags),
        };

        // Before this.adapty: bad input is exit 2 even without a token
        assertValid(validateConversion(input));

        const answer = await this.adapty.analytics.conversion(input);

        this.render(answer, analyticsView(flags.csv, conversionTable));
        // Beside a CSV of a period without data, its summary; an empty text otherwise
        process.stderr.write(csvNotice(answer, flags.csv));

        return answer;
    }
}
