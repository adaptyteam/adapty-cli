import { csvLine } from './csv.js';

import type { Cell } from './csv.js';
import type { AnalyticsMeta, AnalyticsSegment } from '../../../sdk/adapty/index.js';

/** A segment field that the views print, under the name the API gives it. */
export type Column<S> = {
    name: string;
    read: (segment: S) => Cell;
};

/** `main` is the asked period; `compare` the compared one, of a chart or a conversion. */
export type Section<S> = {
    period: 'compare' | 'main';
    segments: readonly S[];
    /** The numbers of the whole period, as `data` (or `data.compare`) has them. */
    summary: readonly (readonly [name: string, value: Cell])[];
};

/** How one operation's answer becomes a table: one row per segment, its fields, then one column per point. */
export type AnalyticsTable<R, S> = {
    columns: readonly Column<S>[];
    /** Whether the answer can hold a compared period: then the CSV starts with a `period` column. */
    comparable: boolean;
    /** Lines after `No data for this period.`, such as a window that has data. */
    emptyNotes?: (response: R) => string[];
    sections: (response: R) => Section<S>[];
};

type Segment = AnalyticsSegment & { values: readonly object[] };

type Response = { meta: AnalyticsMeta };

/** A number the backend does not have is null, and printing it as 0 would be a lie. */
const NO_VALUE = '—';

export const NO_DATA = 'No data for this period.';

/** An empty text (the key of a "No Data" group) is shown as `""`, so it never reads as a missing value. */
const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) {
        return NO_VALUE;
    }

    if (value === '') {
        return '""';
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    return JSON.stringify(value);
};

/** The API answers with the total first; the views hold to that whatever the order, and drop nothing. */
const totalFirst = <S extends AnalyticsSegment>(segments: readonly S[]): S[] =>
    [...segments.filter(segment => segment.is_total), ...segments.filter(segment => !segment.is_total)];

type PointFields = { title?: unknown; value?: unknown; x?: unknown };

/** A point is found by its `x`; a funnel step or a retention period is shown by its title. */
const pointId = (point: object): string => String((point as PointFields).x);

const pointLabel = (point: object): string => {
    const { title } = point as PointFields;

    return typeof title === 'string' ? title : pointId(point);
};

const pointValue = (point: object): Cell => (point as PointFields).value as Cell;

/** Every field of a point besides its position and value: a conversion's counts, a cohort's averages. */
const pointExtras = (point: object): string => {
    const extras = Object.entries(point)
        .filter(([name]) => name !== 'x' && name !== 'title' && name !== 'value')
        .map(([name, value]) => `${name} ${formatValue(value)}`);

    return extras.length === 0 ? '' : ` (${extras.join(', ')})`;
};

const segmentBlock = <S extends Segment>(columns: readonly Column<S>[], segment: S): string => {
    const fields = columns.map(column => `${column.name}: ${formatValue(column.read(segment))}`);
    const points = segment.values.map(point => `  ${pointLabel(point)}: ${formatValue(pointValue(point))}${pointExtras(point)}`);

    return [...fields, ...(points.length === 0 ? [] : ['values:', ...points])].join('\n');
};

const timezoneLines = ({ meta }: Response): string[] => {
    const { timezone, timezone_source: source } = meta.query;

    return [`timezone: ${formatValue(timezone)}`, `timezone_source: ${formatValue(source)}`];
};

/**
 * The human view: the numbers of the period and its time zone, then one labelled block per segment, total first,
 * `---` between blocks. No segments: `No data for this period.` A compared period follows under its own heading.
 * Field names stay as the API sends them, so what a reader sees is what they find in --json.
 */
export const renderHuman = <R extends Response, S extends Segment>(table: AnalyticsTable<R, S>, response: R): string =>
    table.sections(response).map((section) => {
        const heading = section.period === 'compare' ? ['Compared period'] : [];

        if (section.segments.length === 0) {
            const notes = section.period === 'main' ? table.emptyNotes?.(response) ?? [] : [];

            return [...heading, NO_DATA, ...notes].join('\n');
        }

        const summary = [
            ...section.summary.map(([name, value]) => `${name}: ${formatValue(value)}`),
            ...(section.period === 'main' ? timezoneLines(response) : []),
        ];

        const blocks = totalFirst(section.segments).map(segment => segmentBlock(table.columns, segment));

        return [...heading, ...summary, '', blocks.join('\n---\n')].join('\n');
    }).join('\n\n');

/**
 * The CSV view, made from the API answer: a header line, then one row per segment, total first; a compared
 * period's rows follow the asked period's. Columns: `period` (when the operation can compare), the segment
 * fields, then one column per point (its `x`, or its title for a funnel step or a retention period). A null
 * value and a point that a segment does not have are empty cells. No segments: the header line alone.
 */
export const renderCsv = <R extends Response, S extends Segment>(table: AnalyticsTable<R, S>, response: R): string => {
    const sections = table.sections(response).map(section => ({ ...section, segments: totalFirst(section.segments) }));
    const points = new Map<string, string>();

    for (const section of sections) {
        for (const segment of section.segments) {
            for (const point of segment.values) {
                if (!points.has(pointId(point))) {
                    points.set(pointId(point), pointLabel(point));
                }
            }
        }
    }

    const header = [...(table.comparable ? ['period'] : []), ...table.columns.map(column => column.name), ...points.values()];

    const rows = sections.flatMap(section => section.segments.map((segment) => {
        const values = new Map(segment.values.map(point => [pointId(point), pointValue(point)]));

        return [
            ...(table.comparable ? [section.period] : []),
            ...table.columns.map(column => column.read(segment)),
            ...[...points.keys()].map(id => values.get(id)),
        ];
    }));

    return [header, ...rows].map(cells => csvLine(cells)).join('\n');
};

/** The view of a data command: the CSV with `--csv`, else the human view (`--json` prints no view at all). */
export const analyticsView = <R extends Response, S extends Segment>(table: AnalyticsTable<R, S>, csv: boolean) =>
    (response: R): string => (csv ? renderCsv(table, response) : renderHuman(table, response));
