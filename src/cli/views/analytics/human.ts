import {
    formatValue, line, NO_DATA, NO_VALUE, pointId, pointLabel, renderCsv, sectionsOf,
} from './segments.js';

import type { AnalyticsAnswer, Segment } from './segments.js';

/**
 * The human view of the six analytics operations: a short table, one row per group (the total first), the main
 * numbers of the group and one column per point (a date, a funnel step, a period). The resolved query gives the
 * heading. Where an operation has more fields than one table holds, a line under it says that `--json` and
 * `--csv` give every field.
 */

type Query = Record<string, unknown>;

/** How a number reads: money with 2 decimals, any other number as the API gives it, null as `—`. */
type Format = (value: unknown) => string;

const asGiven: Format = (value) => {
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
        return String(value);
    }

    return NO_VALUE;
};

const money: Format = value => (typeof value === 'number' ? value.toFixed(2) : asGiven(value));

/** One number of a group: its header and the segment field it shows. */
type Column = {
    field: string;
    format: Format;
    header: string;
};

export type HumanTable = {
    /** The numbers of a group after its title, the main value first. */
    columns: (query: Query) => Column[];
    /** The fields the table leaves out; none when it shows every number of the answer. */
    omitted?: string;
    /** How the value of a point reads. */
    points: (query: Query) => Format;
    /** What the answer is, from the resolved query: the operation, then its options. */
    title: (query: Query) => (string | undefined)[];
};

const text = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

const groupedBy = (query: Query): string | undefined => {
    const segmentation = text(query.segmentation);

    return segmentation === undefined ? undefined : `by ${segmentation}`;
};

const perPeriod = (query: Query): string | undefined => {
    if (query.period_type === 'renewals') {
        return 'per renewal';
    }

    return query.period_type === 'days' ? 'per day' : undefined;
};

const isMoneyChart = (query: Query): boolean => text(query.revenue_basis) !== undefined;

export const chartTable: HumanTable = {
    columns: query => [{ field: 'value', format: isMoneyChart(query) ? money : asGiven, header: 'Total' }],
    points: query => (isMoneyChart(query) ? money : asGiven),
    title: query => [['Chart', text(query.chart_id)].filter(part => part !== undefined).join(' '), text(query.revenue_basis), groupedBy(query)],
};

export const conversionTable: HumanTable = {
    columns: () => [
        { field: 'value', format: asGiven, header: 'Conversion %' },
        { field: 'value_from', format: asGiven, header: 'From' },
        { field: 'value_to', format: asGiven, header: 'To' },
    ],
    omitted: 'the counts of each point (value_from, value_to, value_from_unfinished, has_unfinished)',
    points: () => asGiven,
    title: query => [['Conversion', text(query.conversion_id)].filter(part => part !== undefined).join(' '), groupedBy(query)],
};

export const funnelTable: HumanTable = {
    columns: () => [{ field: 'value', format: asGiven, header: 'Installs' }],
    omitted: 'the share of each step, the change to the next step, churn reasons and parts',
    points: () => asGiven,
    title: query => ['Funnel', groupedBy(query)],
};

export const retentionTable: HumanTable = {
    columns: () => [{ field: 'value', format: asGiven, header: 'Subscribers' }],
    omitted: 'the share of each period (value_relative)',
    points: () => asGiven,
    title: query => ['Retention', query.use_trial === true ? 'from the trial' : undefined, groupedBy(query)],
};

export const ltvTable: HumanTable = {
    columns: () => [
        { field: 'value', format: money, header: 'LTV' },
        { field: 'cohort_size', format: asGiven, header: 'Cohort size' },
    ],
    points: () => money,
    title: query => ['LTV', text(query.revenue_basis), perPeriod(query), groupedBy(query)],
};

export const cohortTable: HumanTable = {
    columns: () => [
        { field: 'value', format: money, header: 'Revenue' },
        { field: 'installs', format: asGiven, header: 'Installs' },
        { field: 'subscribers', format: asGiven, header: 'Subscribers' },
    ],
    omitted: 'revenue, ARPU, ARPPU and ARPAS on each basis, subscriptions, the shares of each period, predictions',
    points: () => money,
    title: query => ['Cohorts', text(query.revenue_basis), perPeriod(query)],
};

const range = (dates: unknown): string | undefined =>
    (Array.isArray(dates) && dates.length > 0 ? dates.join(' – ') : undefined);

const PERIOD_KEYS = new Set(['compare_date', 'date']);

/** The filters besides the period, as `--filter` takes them. */
const filtersOf = (filters: Record<string, readonly string[]>): string | undefined => {
    const given = Object.entries(filters).filter(([dimension]) => !PERIOD_KEYS.has(dimension))
        .map(([dimension, values]) => `${dimension}=${values.map(value => value.replaceAll(',', String.raw`\,`)).join(',')}`);

    return given.length === 0 ? undefined : `filters ${given.join(' ')}`;
};

const TIMEZONE_SOURCES: Record<string, string> = { app: 'from the app', request: 'from --timezone' };

/** The period, the length of one point, the time zone and where it comes from, and the filters. */
const periodLine = (query: Query): string => {
    const filters = (query.filters ?? {}) as Record<string, readonly string[]>;
    const source = TIMEZONE_SOURCES[String(query.timezone_source)];
    const zone = text(query.timezone);
    const timezone = zone === undefined ? undefined : `time zone ${zone}${source === undefined ? '' : ` (${source})`}`;

    return [range(filters.date), text(query.period_unit), timezone, filtersOf(filters)]
        .filter(part => part !== undefined).join(', ');
};

/** Rows of cells, the first column left-aligned, the numbers right-aligned, two spaces between. */
const table = (rows: readonly string[][]): string => {
    const widths = rows[0]?.map((_, column) => Math.max(...rows.map(row => row[column]?.length ?? 0))) ?? [];

    return rows.map(row => row.map((cell, column) => (column === 0
        ? cell.padEnd(widths[column] ?? 0)
        : cell.padStart(widths[column] ?? 0))).join('  ').trimEnd()).join('\n');
};

const fieldOf = (value: object, name: string): unknown => (value as Record<string, unknown>)[name];

/** One row per group, the total first (as `sectionsOf` orders them), then one column per point in first-seen order. */
const tableOf = (spec: HumanTable, query: Query, segments: readonly Segment[]): string => {
    const columns = spec.columns(query);
    const format = spec.points(query);
    const points = new Map<string, string>();

    for (const point of segments.flatMap(segment => segment.values)) {
        if (!points.has(pointId(point))) {
            points.set(pointId(point), pointLabel(point));
        }
    }

    const rows = segments.map(segment => [
        formatValue(segment.title),
        ...columns.map(column => column.format(fieldOf(segment, column.field))),
        ...[...points.keys()].map(id => format(fieldOf(segment.values.find(point => pointId(point) === id) ?? {}, 'value'))),
    ]);

    return table([['', ...columns.map(column => column.header), ...points.values()], ...rows]);
};

const comparedHeading = (query: Query): string => {
    const dates = range(((query.filters ?? {}) as Record<string, unknown>).compare_date);

    return dates === undefined ? 'Compared period' : `Compared period: ${dates}`;
};

/**
 * The heading (what, by which grouping; the period, its time zone and filters), then the table of the asked
 * period and, when there is one, of the compared period. A period without groups: `No data for this period.` and
 * the summary of that period, every field, null as `—`.
 */
export const humanView = (spec: HumanTable) => (answer: AnalyticsAnswer): string => {
    const query = answer.meta.query as Query;
    const sections = sectionsOf(answer);

    const bodies = sections.map((section) => {
        const heading = section.period === 'compare' ? [comparedHeading(query)] : [];

        if (section.segments.length === 0) {
            return [...heading, NO_DATA, ...section.summary.map(field => line(field))].join('\n');
        }

        return [...heading, tableOf(spec, query, section.segments)].join('\n');
    });

    const hasTable = sections.some(section => section.segments.length > 0);
    const more = spec.omitted !== undefined && hasTable ? [`--json and --csv give every field: ${spec.omitted}.`] : [];
    const title = spec.title(query).filter(part => part !== undefined).join(', ');

    return [[title, periodLine(query)].join('\n'), ...bodies, ...more].join('\n\n');
};

/** The view of a data command: the CSV with `--csv`, else the human table (`--json` prints no view at all). */
export const analyticsView = (csv: boolean, spec: HumanTable) =>
    (answer: AnalyticsAnswer): string => (csv ? renderCsv(answer) : humanView(spec)(answer));
