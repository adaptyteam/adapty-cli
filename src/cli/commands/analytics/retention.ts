import { Flags } from '@oclif/core';

import { validateRetention } from '../../../sdk/adapty/index.js';
import { assertValid } from '../../../sdk/core/validation.js';
import {
    AdaptyCommand,
    analyticsFilterFlags,
    analyticsPeriodFlags,
    analyticsQueryParams,
    csvFlag,
    groupByFlag,
} from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { analyticsView } from '../../views/analytics/segments.js';

import type { RetentionInput, RetentionResponse } from '../../../sdk/adapty/index.js';

export default class AnalyticsRetention extends AdaptyCommand {
    static override description = 'Read the retention of an app: the subscribers left in each period, per group, '
        + 'the total first (no compared period)';

    static override examples = [
        '<%= config.bin %> analytics retention --app APP_UUID --date-from 2026-07-01 --date-to 2026-09-30',
        '<%= config.bin %> analytics retention --app APP_UUID --date-from 2026-07-01 --date-to 2026-09-30 --group-by country --use-trial --csv',
    ];

    static override flags = {
        ...appIdFlag,
        ...analyticsPeriodFlags,
        ...groupByFlag,
        ...analyticsFilterFlags,
        'use-trial': Flags.boolean({
            description: 'Count from the trial, not from the first paid period',
        }),
        ...csvFlag,
    };

    async run(): Promise<RetentionResponse> {
        const { flags } = await this.parse(AnalyticsRetention);

        const input: RetentionInput = {
            ...analyticsQueryParams(flags),
            groupBy: flags['group-by'],
            // Sent only when given: the backend default (false) applies otherwise, and meta.query says so
            useTrial: flags['use-trial'] ? true : undefined,
        };

        // Before this.adapty: bad input is exit 2 even without a token
        assertValid(validateRetention(input));

        const answer = await this.adapty.analytics.retention(input);

        this.render(answer, analyticsView(flags.csv));

        return answer;
    }
}
