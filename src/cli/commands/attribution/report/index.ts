import { Errors, Flags } from '@oclif/core';

import { granularities, reportGroupBy, sortDirections, validateReport } from '../../../../sdk/attribution/index.js';
import { assertValid } from '../../../../sdk/core/validation.js';
import { AttributionCommand } from '../../../base/attribution/index.js';
import { exitCode } from '../../../errors.js';
import { appFlag, periodFlags, periodParams, revenueBasisFlag } from '../../../flags.js';

import { renderReport } from './lib/render.js';

import type { ReportFilter, ReportInput, ReportResponse, ReportSort, SortDirection } from '../../../../sdk/attribution/index.js';

const usage = (message: string): Errors.CLIError => new Errors.CLIError(message, { exit: exitCode.usage });

/** A comma not preceded by a backslash: `\,` keeps a comma inside a value, as oclif's own delimiter does. */
const VALUE_SEPARATOR = /(?<!\\),/;

/** `dimension=value[,value]`: one value filters by equality, several by any of them. */
const parseFilter = (input: string): Promise<ReportFilter> => {
    const separator = input.indexOf('=');
    const dimension = separator === -1 ? '' : input.slice(0, separator).trim();

    const values = separator === -1
        ? []
        : input.slice(separator + 1).split(VALUE_SEPARATOR).map(value => value.replaceAll('\\,', ',').trim())
                .filter(value => value !== '');

    return dimension === '' || values.length === 0
        ? Promise.reject(usage(`Expected dimension=value[,value], got "${input}".`))
        : Promise.resolve({ dimension, values });
};

const isDirection = (value: string): value is SortDirection => (sortDirections as readonly string[]).includes(value);

/** `field[:asc|desc]`, ascending when the direction is left out. */
const parseSort = (input: string): Promise<ReportSort> => {
    const separator = input.lastIndexOf(':');
    const field = (separator === -1 ? input : input.slice(0, separator)).trim();
    const direction = separator === -1 ? 'asc' : input.slice(separator + 1).trim();

    if (field === '') {
        return Promise.reject(usage(`Expected field[:asc|desc], got "${input}".`));
    }

    return isDirection(direction)
        ? Promise.resolve({ direction, field })
        : Promise.reject(usage(`The sort direction must be asc or desc, got "${direction}".`));
};

export default class AttributionReport extends AttributionCommand {
    static override description = 'Run a UA attribution report for an app: metrics over a period, grouped by dimensions';

    static override examples = [
        '<%= config.bin %> attribution report --app APP_UUID --date-from 2026-08-01 --date-to 2026-08-31 --metrics spend,installs,d7_roas --group-by campaign',
        '<%= config.bin %> attribution report --app APP_UUID --date-from 2026-08-01 --date-to 2026-08-31 --metrics spend --group-by date --granularity week --filter country=US,GB --sort spend:desc',
    ];

    // Input shape here; the rules (dates in order, granularity only with a date grouping) live in
    // sdk/attribution/report.ts, and which names exist is the backend catalog's knowledge.
    static override flags = {
        ...appFlag,
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
            description: 'Date bucket; applies only with --group-by date',
            options: granularities,
        })(),
        'filter': Flags.custom<ReportFilter>({
            description: 'Keep rows whose dimension has one of the values: dimension=value[,value] (repeatable; `\\,` for a comma inside a value)',
            multiple: true,
            parse: parseFilter,
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
