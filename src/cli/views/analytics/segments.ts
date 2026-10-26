import { csvLine } from './csv.js';

import type { Cell } from './csv.js';
import type { AnalyticsSegment } from '../../../sdk/adapty/index.js';

/**
 * The CSV of the six analytics operations and the summary of a period, made from the answer itself: every field
 * the API gives is printed, under the name it has in --json, so a field the backend adds is never dropped. A nested
 * field has a dotted name (`revenue.gross`, `following_changes.value`), a list item its index (`parts[0].value`).
 * The human table, which shows the main fields only, is in `human.ts`.
 */

export type Segment = AnalyticsSegment & { values: readonly object[] };

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
    /** The numbers of the whole period and, for the asked one, the resolved query and the other `meta` fields. */
    summary: Field[];
};

/** A number the backend does not have is null, and printing it as 0 would be a lie. */
export const NO_VALUE = '—';

export const NO_DATA = 'No data for this period.';

/** The fields that name a group; every other field of a segment is a number of that group. */
const IDENTITY = ['key', 'title', 'is_total'];

/** The segment fields every operation has: the CSV header of an answer without segments. */
const BASE_COLUMNS = [...IDENTITY, 'value'];

/** An empty text (the key of a "No Data" group, for example) is shown as `""`, so it never reads as a missing value. */
export const formatValue = (value: Cell): string => {
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
export const pointId = (point: object): string => String((point as PointPosition).x);

/** A period start as the backend gives it: a date, a time and an offset, as in `2026-09-22T00:00:00.000000+0200`. */
const TIMESTAMP = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?$/;

/** The date of a period start in the period's own time zone: the date part as given, with no conversion. */
const dateOf = (id: string): string => TIMESTAMP.exec(id)?.[1] ?? id;

/**
 * How the human view names a point: its `x` (a period start as its date, `2026-09-22`), and for a funnel step or a
 * retention period also its title, the number once (`-2 Install`, `1 Paid`, `2 Period`). The CSV keeps the raw `x`.
 */
export const pointLabel = (point: object): string => {
    const { title } = point as PointPosition;
    const id = dateOf(pointId(point));

    if (typeof title !== 'string') {
        return id;
    }

    return title.startsWith(`${id} `) ? title : `${id} ${title}`;
};

/** The same for the CSV, `value` first: the title stays a field, since a step's title can differ between segments. */
const pointCells = (point: object): Field[] => {
    const fields = fieldsOf(point, ['x']);

    return [...fields.filter(([name]) => name === 'value'), ...fields.filter(([name]) => name !== 'value')];
};

const without = (value: object, names: readonly string[]): object =>
    Object.fromEntries(Object.entries(value).filter(([name]) => !names.includes(name)));

/**
 * Every field of the answer besides the segments, under its JSON path: `data.value`, `data.compare.value`,
 * `meta.query.timezone`, `meta.query.filters.date[0]`, `meta.recommended_period.date_from`. The one source of the
 * summary in both views.
 */
const answerFields = ({ data, meta }: AnalyticsAnswer): Field[] => {
    const { compare } = data;

    return leaves({
        data: {
            ...without(data, ['compare', 'segments']),
            // A chart or a conversion always says whether it has a compared period: null is a value too
            ...(compare === undefined ? {} : { compare: compare === null ? null : without(compare, ['segments']) }),
        },
        meta,
    }, '');
};

/**
 * The summary of the asked period: every field of `data` besides the segments, every field of `meta.query` (the
 * resolved query: the time zone, the filters, the defaults) and every other field of `meta` (a conversion's
 * `recommended_period`), named as in their object. Of a compared period: the fields of `data.compare`.
 */
export const sectionsOf = (answer: AnalyticsAnswer): Section[] => {
    const fields = answerFields(answer);
    const { compare, segments } = answer.data;

    const main = fields.filter(([name]) => !name.startsWith('data.compare'))
        .map(([name, value]): Field => [name.replace(/^(?:data|meta\.query|meta)\./, ''), value]);

    const compared = fields.filter(([name]) => name.startsWith('data.compare.'))
        .map(([name, value]): Field => [name.slice('data.compare.'.length), value]);

    return [
        { period: 'main', segments: totalFirst(segments), summary: main },
        ...(compare === undefined || compare === null ? [] : [{ period: 'compare' as const, segments: totalFirst(compare.segments), summary: compared }]),
    ];
};

export const line = ([name, value]: Field): string => `${name}: ${formatValue(value)}`;

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

/**
 * The total is the segment with `is_total`; every other group is found by its raw key, so `null`, `""` and `"None"`
 * are three groups, and none of them is the total. A key can repeat inside one period (a funnel key is the group
 * title): such a key is the same group in both periods only by position, the first with the first, and so on. A key
 * that is unique in both periods is matched by itself.
 */
const groupsOf = ({ data }: AnalyticsAnswer): Group[] => {
    const periods = [
        ['main', totalFirst(data.segments)],
        ['compare', totalFirst(data.compare?.segments ?? [])],
    ] as const;

    const keyOf = (segment: Segment): string => JSON.stringify(segment.key);

    const count = (segments: readonly Segment[], key: string): number => segments
        .filter(segment => !segment.is_total && keyOf(segment) === key).length;

    const groups = new Map<string, Group>();

    for (const [period, segments] of periods) {
        const seen = new Map<string, number>();

        for (const segment of segments) {
            const key = keyOf(segment);
            const position = seen.get(key) ?? 0;

            seen.set(key, position + 1);

            const unique = periods.every(([, other]) => count(other, key) <= 1);
            const own = unique ? `key:${key}` : `key:${key}#${position}`;
            const id = segment.is_total ? 'total' : own;

            groups.set(id, { ...groups.get(id), [period]: segment });
        }
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

/**
 * The CSV view, made from the API answer: a header line, then one row per group, the total first (`is_total`
 * true; its `key` cell is empty, as is the cell of a group whose raw key is null; a key `""` is written `""`).
 * Columns: `key`, `title`, `is_total`; the numbers of the group in the asked period, then each point's `value`
 * (named by its `x`) and its other fields as `<x>.<field>` (a funnel step's or retention period's title as
 * `<x>.title`); the same for the compared period under `compare.`; then every other field of the answer under its
 * JSON path (`data.value`, `data.compare.value`, `meta.query.timezone`, `meta.query.revenue_basis`, ...), the same
 * on every row. A group of one period only has empty cells in the other. A null value is an empty cell. No groups:
 * the header line alone.
 */
export const renderCsv = (answer: AnalyticsAnswer): string => {
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
 * What a data command writes to stderr: with `--csv`, when the asked period has no segments, `No data for this
 * period.` and the summary of each period, as the human view shows them (the CSV is then its header alone, or the
 * groups of the compared period); else nothing, an empty text.
 */
export const csvNotice = (answer: AnalyticsAnswer, csv: boolean): string => {
    if (!csv || answer.data.segments.length > 0) {
        return '';
    }

    const sections = sectionsOf(answer).map(section => [
        ...(section.period === 'compare' ? ['Compared period'] : []),
        ...(section.segments.length === 0 ? [NO_DATA] : []),
        ...section.summary.map(field => line(field)),
    ].join('\n'));

    return `${sections.join('\n\n')}\n`;
};
