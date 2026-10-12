import { csvLine } from './csv.js';

import type { Cell } from './csv.js';
import type { AnalyticsSegment } from '../../../sdk/adapty/index.js';

/**
 * The views of the six analytics operations, made from the answer itself: every field the API gives is printed,
 * under the name it has in --json, so a field the backend adds is never dropped. A nested field has a dotted
 * name (`revenue.gross`, `following_changes.value`), a list item its index (`parts[0].value`).
 */

type Segment = AnalyticsSegment & { values: readonly object[] };

type Segments = { segments: readonly Segment[] };

/** What every analytics answer has; `compare` only a chart and a conversion, null without a compared period. */
type Answer = {
    data: Segments & { compare?: null | Segments };
    meta: { query: object };
};

type Field = readonly [name: string, value: Cell];

/** `main` is the asked period; `compare` the compared one. */
type Section = {
    period: 'compare' | 'main';
    segments: readonly Segment[];
    /** The numbers of the whole period: the fields of `data` (or `data.compare`) besides the segments. */
    summary: Field[];
};

/** A number the backend does not have is null, and printing it as 0 would be a lie. */
const NO_VALUE = '—';

export const NO_DATA = 'No data for this period.';

/** The segment fields every operation has: the CSV header of an answer without segments. */
const BASE_COLUMNS = ['key', 'title', 'is_total', 'value'];

/** An empty text (the key of a "No Data" group) is shown as `""`, so it never reads as a missing value. */
const formatValue = (value: Cell): string => {
    if (value === null || value === undefined) {
        return NO_VALUE;
    }

    return value === '' ? '""' : String(value);
};

/** Every leaf of a value under its dotted name. An empty list has no leaf; a null object is one null leaf. */
const leaves = (value: unknown, name: string): Field[] => {
    if (Array.isArray(value)) {
        return value.flatMap((item, index) => leaves(item, `${name}[${index}]`));
    }

    if (typeof value === 'object' && value !== null) {
        return Object.entries(value).flatMap(([key, item]) => leaves(item, name === '' ? key : `${name}.${key}`));
    }

    return [[name, value as Cell]];
};

/** The fields of an object, leaving out the ones the view shows in another way. */
const fieldsOf = (value: object, skip: readonly string[]): Field[] =>
    leaves(Object.fromEntries(Object.entries(value).filter(([key]) => !skip.includes(key))), '');

/** The API answers with the total first; the views hold to that whatever the order, and drop nothing. */
const totalFirst = (segments: readonly Segment[]): Segment[] =>
    [...segments.filter(segment => segment.is_total), ...segments.filter(segment => !segment.is_total)];

type PointPosition = { title?: unknown; x?: unknown };

/** A point is found by its `x`; a funnel step or a retention period is shown by its title. */
const pointId = (point: object): string => String((point as PointPosition).x);

const pointLabel = (point: object): string => {
    const { title } = point as PointPosition;

    return typeof title === 'string' ? title : pointId(point);
};

/** Everything of a point besides its position: `value` first, as the API sends it. */
const pointFields = (point: object): Field[] => fieldsOf(point, ['title', 'x']);

const sectionsOf = ({ data }: Answer): Section[] => [
    { period: 'main', segments: totalFirst(data.segments), summary: fieldsOf(data, ['compare', 'segments']) },
    ...(data.compare === undefined || data.compare === null
        ? []
        : [{ period: 'compare' as const, segments: totalFirst(data.compare.segments), summary: fieldsOf(data.compare, ['segments']) }]),
];

const line = ([name, value]: Field): string => `${name}: ${formatValue(value)}`;

const pointLine = (point: object): string => {
    const fields = pointFields(point);
    const value = fields.find(([name]) => name === 'value')?.[1];
    const extras = fields.filter(([name]) => name !== 'value').map(([name, item]) => `${name} ${formatValue(item)}`);

    return `  ${pointLabel(point)}: ${formatValue(value)}${extras.length === 0 ? '' : ` (${extras.join(', ')})`}`;
};

const segmentBlock = (segment: Segment): string => {
    const points = segment.values.map(point => pointLine(point));

    return [...fieldsOf(segment, ['values']).map(field => line(field)), ...(points.length === 0 ? [] : ['values:', ...points])].join('\n');
};

/**
 * The human view: the numbers of the period and its time zone, then one labelled block per segment, total first,
 * `---` between blocks. No segments: `No data for this period.`, then what else the answer says (a window with
 * data). A compared period follows under its own heading.
 */
export const renderHuman = (answer: Answer): string => sectionsOf(answer).map((section) => {
    const heading = section.period === 'compare' ? ['Compared period'] : [];
    const isMain = section.period === 'main';

    if (section.segments.length === 0) {
        const notes = isMain ? fieldsOf(answer.meta, ['query']).filter(([, value]) => value !== null) : [];

        return [...heading, NO_DATA, ...notes.map(field => line(field))].join('\n');
    }

    const timezone = isMain ? fieldsOf(answer.meta.query, []).filter(([name]) => name.startsWith('timezone')) : [];
    const summary = [...section.summary, ...timezone].map(field => line(field));

    return [...heading, ...summary, '', section.segments.map(segment => segmentBlock(segment)).join('\n---\n')].join('\n');
}).join('\n\n');

/** Names in first-seen order, without a name that only stands for its nested fields elsewhere (a null `predict`). */
const columnsOf = (rows: readonly (readonly Field[])[]): string[] => {
    const names = [...new Set(rows.flatMap(fields => fields.map(([name]) => name)))];

    return names.filter(name => !names.some(other => other.startsWith(`${name}.`) || other.startsWith(`${name}[`)));
};

/**
 * The CSV view, made from the API answer: a header line, then one row per segment, total first; a compared
 * period's rows follow the asked period's. Columns: `period` (for a chart and a conversion), every segment field,
 * then for each point (by its `x`, named by its `x` or its step title) its `value` under that name and each other
 * field under `<point>.<field>`. A null value and a field a segment does not have are empty cells. No segments:
 * the header of the fields every segment has.
 */
export const renderCsv = (answer: Answer): string => {
    const comparable = 'compare' in answer.data;
    const sections = sectionsOf(answer);
    const segments = sections.flatMap(section => section.segments);
    const segmentColumns = segments.length === 0 ? BASE_COLUMNS : columnsOf(segments.map(segment => fieldsOf(segment, ['values'])));

    const points = new Map<string, { fields: Field[][]; label: string }>();

    for (const point of segments.flatMap(segment => segment.values)) {
        const known = points.get(pointId(point)) ?? { fields: [], label: pointLabel(point) };

        known.fields.push(pointFields(point));
        points.set(pointId(point), known);
    }

    const pointColumns = [...points.entries()].flatMap(([id, { fields, label }]) => columnsOf(fields)
        .map(name => ({ header: name === 'value' ? label : `${label}.${name}`, id, name })));

    const header = [...(comparable ? ['period'] : []), ...segmentColumns, ...pointColumns.map(column => column.header)];

    const rows = sections.flatMap(section => section.segments.map((segment) => {
        const own = new Map(fieldsOf(segment, ['values']));
        const byPoint = new Map(segment.values.map(point => [pointId(point), new Map(pointFields(point))]));

        return [
            ...(comparable ? [section.period] : []),
            ...segmentColumns.map(name => own.get(name)),
            ...pointColumns.map(({ id, name }) => byPoint.get(id)?.get(name)),
        ];
    }));

    return [header, ...rows].map(cells => csvLine(cells)).join('\n');
};

/** The view of a data command: the CSV with `--csv`, else the human view (`--json` prints no view at all). */
export const analyticsView = (csv: boolean) =>
    (answer: Answer): string => (csv ? renderCsv(answer) : renderHuman(answer));
