import { Flags } from '@oclif/core';

import { granularities, reportGroupBy, sortDirections, validateReport } from '../../../../sdk/attribution/index.js';
import { assertValid } from '../../../../sdk/core/validation.js';
import { AttributionCommand } from '../../../base/attribution/index.js';
import { usageError } from '../../../errors.js';
import { appIdFlag, parseDimensionFilter, periodFlags, periodParams, revenueBasisFlag } from '../../../flags.js';

import { renderReport } from './lib/render.js';

import type { ReportFilter, ReportInput, ReportResponse, ReportSort, SortDirection } from '../../../../sdk/attribution/index.js';

const isDirection = (value: string): value is SortDirection => (sortDirections as readonly string[]).includes(value);

/** `field[:asc|desc]`, ascending when the direction is left out. */
const parseSort = (input: string): Promise<ReportSort> => {
    const separator = input.lastIndexOf(':');
    const field = (separator === -1 ? input : input.slice(0, separator)).trim();
    const direction = separator === -1 ? 'asc' : input.slice(separator + 1).trim();

    if (field === '') {
        return Promise.reject(usageError(`Expected field[:asc|desc], got "${input}".`));
    }

    return isDirection(direction)
        ? Promise.resolve({ direction, field })
        : Promise.reject(usageError(`The sort direction must be asc or desc, got "${direction}".`));
};

export default class AttributionReport extends AttributionCommand {
    static override description = 'Run an Attribution report for an app: metrics over a period, grouped by dimensions';

    static override examples = [
        '<%= config.bin %> attribution report --app APP_UUID --date-from 2026-08-01 --date-to 2026-08-31 --metrics spend,installs,d7_roas --group-by campaign',
        '<%= config.bin %> attribution report --app APP_UUID --date-from 2026-08-01 --date-to 2026-08-31 --metrics spend --group-by date --granularity week --filter country=US,GB --sort spend:desc',
        '<%= config.bin %> attribution report --app APP_UUID --date-from 2026-08-01 --date-to 2026-08-31 --metrics spend,installs,d7_roas --group-by campaign --json',
    ];

    // Input shape here; the rules (dates in order, a granularity exactly when grouping by date) live
    // in sdk/attribution/report.ts, and which names exist is the backend catalog's knowledge.
    static override flags = {
        ...appIdFlag,
        ...periodFlags,
        'metrics': Flags.string({
            delimiter: ',',
            description: 'Metric names, as `adapty attribution metrics` lists them (repeatable or comma-separated)',
            multiple: true,
            required: true,
        }),
        'group-by': Flags.option({
            delimiter: ',',
            description: 'Dimensions to group rows by (repeatable or comma-separated)',
            multiple: true,
            options: reportGroupBy,
            required: true,
        })(),
        'granularity': Flags.option({
            description: 'Date bucket; required with --group-by date, and allowed only with it',
            options: granularities,
        })(),
        'filter': Flags.custom<ReportFilter>({
            description: 'Keep rows whose dimension has one of the values: dimension=value[,value] (repeatable; `\\,` for a comma inside a value)',
            multiple: true,
            parse: parseDimensionFilter,
        })(),
        ...revenueBasisFlag,
        'sort': Flags.custom<ReportSort>({
            description: 'Sort rows by a requested metric or dimension: field[:asc|desc] (ascending by default)',
            parse: parseSort,
        })(),
    };

    async run(): Promise<ReportResponse> {
        const { flags } = await this.parse(AttributionReport);

        const input: ReportInput = {
            appId: flags.app,
            ...periodParams(flags),
            filters: flags.filter,
            granularity: flags.granularity,
            groupBy: flags['group-by'],
            metrics: flags.metrics.filter(metric => metric !== ''),
            revenueBasis: flags['revenue-basis'],
            sort: flags.sort,
        };

        // Before this.attribution: bad input is exit 2 even without a token
        assertValid(validateReport(input));

        const report = await this.attribution.report(input);

        this.render(report, renderReport);

        return report;
    }
}
