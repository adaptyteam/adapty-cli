import { validateCohort } from '../../../sdk/adapty/index.js';
import { assertValid } from '../../../sdk/core/validation.js';
import {
    AdaptyCommand,
    csvFlag,
    filterFlags,
    granularityFlag,
    groupingParams,
    periodFlags,
    queryParams,
    renewalPeriodFlags,
    revenueBasisFlag,
} from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { analyticsView, cohortTable } from '../../views/analytics/human.js';
import { csvNotice } from '../../views/analytics/segments.js';

import type { CohortInput, CohortResponse } from '../../../sdk/adapty/index.js';

export default class AnalyticsCohort extends AdaptyCommand {
    static override description = 'Read the install cohorts of an app: revenue, subscribers and averages of each '
        + 'cohort per renewal (or day), with predictions, the total first (no grouping, no compared period)';

    static override examples = [
        '<%= config.bin %> analytics cohort --app APP_UUID --date-from 2026-07-01 --date-to 2026-09-30',
        '<%= config.bin %> analytics cohort --app APP_UUID --date-from 2026-07-01 --date-to 2026-09-30 --granularity week --revenue-basis proceeds --csv',
    ];

    static override flags = {
        ...appIdFlag,
        ...periodFlags,
        ...filterFlags,
        ...granularityFlag('The length of one cohort (default month)'),
        ...revenueBasisFlag,
        ...renewalPeriodFlags,
        ...csvFlag,
    };

    async run(): Promise<CohortResponse> {
        const { flags } = await this.parse(AnalyticsCohort);

        const input: CohortInput = {
            ...queryParams(flags),
            ...groupingParams(flags),
            periodType: flags['period-type'],
            renewalDays: flags['renewal-days'],
            revenueBasis: flags['revenue-basis'],
        };

        // Before this.adapty: bad input is exit 2 even without a token
        assertValid(validateCohort(input));

        const answer = await this.adapty.analytics.cohort(input);

        this.render(answer, analyticsView(flags.csv, cohortTable));
        // Beside a CSV of a period without data, its summary; an empty text otherwise
        process.stderr.write(csvNotice(answer, flags.csv));

        return answer;
    }
}
