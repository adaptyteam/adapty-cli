import { validateLtv } from '../../../sdk/adapty/index.js';
import { assertValid } from '../../../sdk/core/validation.js';
import {
    AdaptyCommand,
    analyticsFilterFlags,
    analyticsPeriodFlags,
    analyticsQueryParams,
    analyticsRevenueBasisFlag,
    csvFlag,
    groupByFlag,
    renewalPeriodFlags,
} from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { analyticsView } from '../../views/analytics/segments.js';

import type { LtvInput, LtvResponse } from '../../../sdk/adapty/index.js';

export default class AnalyticsLtv extends AdaptyCommand {
    static override description = 'Read the LTV of an app: the revenue per paying user after each renewal (or day), '
        + 'per group, the total first (no compared period)';

    static override examples = [
        '<%= config.bin %> analytics ltv --app APP_UUID --date-from 2026-07-01 --date-to 2026-09-30',
        '<%= config.bin %> analytics ltv --app APP_UUID --date-from 2026-07-01 --date-to 2026-09-30 --revenue-basis net --period-type days --renewal-days 7,30,90 --csv',
    ];

    static override flags = {
        ...appIdFlag,
        ...analyticsPeriodFlags,
        ...groupByFlag,
        ...analyticsFilterFlags,
        ...analyticsRevenueBasisFlag,
        ...renewalPeriodFlags,
        ...csvFlag,
    };

    async run(): Promise<LtvResponse> {
        const { flags } = await this.parse(AnalyticsLtv);

        const input: LtvInput = {
            ...analyticsQueryParams(flags),
            groupBy: flags['group-by'],
            periodType: flags['period-type'],
            renewalDays: flags['renewal-days'],
            revenueBasis: flags['revenue-basis'],
        };

        // Before this.adapty: bad input is exit 2 even without a token
        assertValid(validateLtv(input));

        const answer = await this.adapty.analytics.ltv(input);

        this.render(answer, analyticsView(flags.csv));

        return answer;
    }
}
