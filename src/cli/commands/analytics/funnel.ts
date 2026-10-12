import { validateFunnel } from '../../../sdk/adapty/index.js';
import { assertValid } from '../../../sdk/core/validation.js';
import {
    AdaptyCommand,
    csvFlag,
    filterFlags,
    groupByFlag,
    groupingParams,
    periodFlags,
    queryParams,
} from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { analyticsView, csvNotice } from '../../views/analytics/segments.js';

import type { FunnelInput, FunnelResponse } from '../../../sdk/adapty/index.js';

export default class AnalyticsFunnel extends AdaptyCommand {
    static override description = 'Read the funnel of an app, from install to renewals: the count at each step, '
        + 'per group, the total first (no compared period: the funnel query cannot keep two periods apart)';

    static override examples = [
        '<%= config.bin %> analytics funnel --app APP_UUID --date-from 2026-07-01 --date-to 2026-09-30',
        '<%= config.bin %> analytics funnel --app APP_UUID --date-from 2026-07-01 --date-to 2026-09-30 --group-by country --csv',
    ];

    static override flags = {
        ...appIdFlag,
        ...periodFlags,
        ...groupByFlag,
        ...filterFlags,
        ...csvFlag,
    };

    async run(): Promise<FunnelResponse> {
        const { flags } = await this.parse(AnalyticsFunnel);

        const input: FunnelInput = { ...queryParams(flags), ...groupingParams(flags) };

        // Before this.adapty: bad input is exit 2 even without a token
        assertValid(validateFunnel(input));

        const answer = await this.adapty.analytics.funnel(input);

        this.render(answer, analyticsView(flags.csv));
        // Beside a CSV of a period without data, its summary; an empty text otherwise
        process.stderr.write(csvNotice(answer, flags.csv));

        return answer;
    }
}
