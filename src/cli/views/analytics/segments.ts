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
export type AnalyticsAnswer = {
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

const NO_DATA = 'No data for this period.';

/** The fields that name a group; every other field of a segment is a number of that group. */
const IDENTITY = ['key', 'title', 'is_total'];

/** The segment fields every operation has: the CSV header of an answer without segments. */
const BASE_COLUMNS = [...IDENTITY, 'value'];

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

/** A point is found by its `x`. */
const pointId = (point: object): string => String((point as PointPosition).x);

/**
 * How the human view names a point: its `x`, and for a funnel step or a retention period also its title, the
 * number once (`-2 Install`, `1 Paid`, `2 Period`).
 */
const pointLabel = (point: object): string => {
    const { title } = point as PointPosition;
    const id = pointId(point);

    if (typeof title !== 'string') {
        return id;
    }

    return title.startsWith(`${id} `) ? title : `${id} ${title}`;
};

/** Everything of a point besides its position: `value` first, as the API sends it. */
const pointFields = (point: object): Field[] => fieldsOf(point, ['title', 'x']);

/** The same for the CSV, `value` first: the title stays a field, since a step's title can differ between segments. */
const pointCells = (point: object): Field[] => {
    const fields = fieldsOf(point, ['x']);

    return [...fields.filter(([name]) => name === 'value'), ...fields.filter(([name]) => name !== 'value')];
};

/**
 * The summary of the asked period: the fields of `data` besides the segments, the time zone of the query and every
 * other field of `meta` (a conversion's `recommended_period`). Of a compared period: the fields of `data.compare`.
 */
const sectionsOf = ({ data, meta }: AnalyticsAnswer): Section[] => [
    {
        period: 'main',
        segments: totalFirst(data.segments),
        summary: [
            ...fieldsOf(data, ['compare', 'segments']),
            ...fieldsOf(meta.query, []).filter(([name]) => name === 'timezone' || name === 'timezone_source'),
            ...fieldsOf(meta, ['query']),
        ],
    },
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
 * The human view: the summary of the period (its numbers, its time zone), then one labelled block per segment,
 * total first, `---` between blocks. No segments: `No data for this period.`, then the same summary, null as `—`.
 * A compared period follows under its own heading.
 */
const renderHuman = (answer: AnalyticsAnswer): string => sectionsOf(answer).map((section) => {
    const heading = section.period === 'compare' ? ['Compared period'] : [];
    const summary = section.summary.map(field => line(field));

    if (section.segments.length === 0) {
        return [...heading, NO_DATA, ...summary].join('\n');
    }

    return [...heading, ...summary, '', section.segments.map(segment => segmentBlock(segment)).join('\n---\n')].join('\n');
}).join('\n\n');

/** Names in first-seen order, without a name that only stands for its nested fields elsewhere (a null `predict`). */
const columnsOf = (rows: readonly (readonly Field[])[]): string[] => {
    const names = [...new Set(rows.flatMap(fields => fields.map(([name]) => name)))];

    return names.filter(name => !names.some(other => other.startsWith(`${name}.`) || other.startsWith(`${name}[`)));
};

/** One CSV column: its header and how a group row reads its cell. */
type Column = {
    header: string;
    read: (group: Group) => Cell;
};

/** One group of the answer: its segment in the asked period, in the compared one, or in both. */
type Group = {
    compare?: Segment | undefined;
    main?: Segment | undefined;
};

/** The total is the one segment without a key; every other group is found by its key, `""` included. */
const groupId = (segment: Segment): string => (segment.is_total ? 'total' : `key:${String(segment.key)}`);

/** The groups of both periods, the total first, then the groups in the order the API gives them. */
const groupsOf = ({ data }: AnalyticsAnswer): Group[] => {
    const groups = new Map<string, Group>();
    const compare = data.compare?.segments ?? [];

    for (const [period, segment] of [
        ...totalFirst(data.segments).map(item => ['main', item] as const),
        ...totalFirst(compare).map(item => ['compare', item] as const),
    ]) {
        groups.set(groupId(segment), { ...groups.get(groupId(segment)), [period]: segment });
    }

    const total = groups.get('total');

    const others = [...groups.entries()].filter(([id]) => id !== 'total').map(([, group]) => group);

    return [...(total === undefined ? [] : [total]), ...others];
};

/** The columns of one period: the numbers of its segments, then each point's `value` and its other fields. */
const periodColumns = (
    segments: readonly Segment[],
    prefix: string,
    pick: (group: Group) => Segment | undefined,
): Column[] => {
    const own = columnsOf(segments.map(segment => fieldsOf(segment, [...IDENTITY, 'values'])))
        .map(name => ({ header: `${prefix}${name}`, read: (group: Group) => new Map(fieldsOf(pick(group) ?? {}, [])).get(name) }));

    const points = new Map<string, Field[][]>();

    for (const point of segments.flatMap(segment => segment.values)) {
        points.set(pointId(point), [...points.get(pointId(point)) ?? [], pointCells(point)]);
    }

    // Named by `x` alone, the same for every segment; a step's title is a cell of its own, `<x>.title`
    const pointColumns = [...points.entries()].flatMap(([id, fields]) => columnsOf(fields).map(name => ({
        header: `${prefix}${name === 'value' ? id : `${id}.${name}`}`,
        read: (group: Group) => {
            const point = pick(group)?.values.find(item => pointId(item) === id);

            return point === undefined ? undefined : new Map(pointCells(point)).get(name);
        },
    })));

    return [...own, ...pointColumns];
};

const without = (value: object, names: readonly string[]): object =>
    Object.fromEntries(Object.entries(value).filter(([name]) => !names.includes(name)));

/** The numbers of the whole answer under their JSON paths, such as `data.value` and `meta.query.timezone`. */
const answerFields = ({ data, meta }: AnalyticsAnswer): Field[] => {
    const { compare } = data;
    const zone = Object.entries(meta.query).filter(([name]) => name === 'timezone' || name === 'timezone_source');

    return leaves({
        data: {
            ...without(data, ['compare', 'segments']),
            // A chart or a conversion always says whether it has a compared period: null is a value too
            ...(compare === undefined ? {} : { compare: compare === null ? null : without(compare, ['segments']) }),
        },
        meta: { query: Object.fromEntries(zone), ...without(meta, ['query']) },
    }, '');
};

/**
 * The CSV view, made from the API answer: a header line, then one row per group, the total first (`is_total`
 * true; its `key` cell is empty, while the "No Data" key `""` is written `""`). Columns: `key`, `title`,
 * `is_total`; the numbers of the group in the asked period, then each point's `value` (named by its `x`) and its
 * other fields as `<x>.<field>` (a funnel step's or retention period's title as `<x>.title`); the same for the
 * compared period under `compare.`; then the numbers of the whole answer under their JSON paths (`data.value`,
 * `data.compare.value`, `meta.query.timezone`, `meta.recommended_period...`), the same on every row. A group of
 * one period only has empty cells in the other. A null value is an empty cell. No groups: the header line alone.
 */
const renderCsv = (answer: AnalyticsAnswer): string => {
    const groups = groupsOf(answer);
    const main = totalFirst(answer.data.segments);
    const compare = totalFirst(answer.data.compare?.segments ?? []);
    const summary = answerFields(answer);
    const summaryNames = columnsOf([summary]);
    const summaryCells = new Map(summary);

    const identity: Column[] = IDENTITY.map(name => ({
        header: name,
        read: group => new Map(fieldsOf(group.main ?? group.compare ?? {}, [])).get(name),
    }));

    const columns: Column[] = [
        ...identity,
        ...(main.length === 0
            ? BASE_COLUMNS.slice(IDENTITY.length).map(name => ({ header: name, read: () => undefined }))
            : periodColumns(main, '', group => group.main)),
        ...periodColumns(compare, 'compare.', group => group.compare),
        ...summaryNames.map(name => ({ header: name, read: () => summaryCells.get(name) })),
    ];

    const rows = groups.map(group => columns.map(column => column.read(group)));

    return [columns.map(column => column.header), ...rows].map(cells => csvLine(cells)).join('\n');
};

/**
 * What `--csv` writes to stderr: when the asked period has no segments, `No data for this period.` and the
 * summary of each period, as the human view shows them. The CSV is then only its header, or the groups of the
 * compared period alone.
 */
export const csvNotice = (answer: AnalyticsAnswer): string | undefined => {
    if (answer.data.segments.length > 0) {
        return undefined;
    }

    return sectionsOf(answer).map(section => [
        ...(section.period === 'compare' ? ['Compared period'] : []),
        ...(section.segments.length === 0 ? [NO_DATA] : []),
        ...section.summary.map(field => line(field)),
    ].join('\n')).join('\n\n');
};

/** The view of a data command: the CSV with `--csv`, else the human view (`--json` prints no view at all). */
export const analyticsView = (csv: boolean) =>
    (answer: AnalyticsAnswer): string => (csv ? renderCsv(answer) : renderHuman(answer));
