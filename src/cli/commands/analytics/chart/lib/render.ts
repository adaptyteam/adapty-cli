import type { ChartResponse, ChartSegment } from '../../../../../sdk/adapty/index.js';

/** A value the server could not compute is null, and printing it as 0 would be a lie. */
const NO_VALUE = '—';

/** Two decimals for money, which a currency code as the unit marks; counts print as they are. */
const isCurrency = (unit: string | undefined): boolean => unit !== undefined && /^[A-Z]{3}$/.test(unit);

/** The raw key first: it is what `--filter` takes, so what a reader sees is what they can type next. */
const segmentLabel = (segment: ChartSegment): string => segment.key ?? segment.title;

/** Every period start in first-seen order: segments share them, but a sparse one must not shift columns. */
const periodStarts = (segments: readonly ChartSegment[]): string[] =>
    [...new Set(segments.flatMap(segment => segment.values.map(point => point.date)))];

const valueAt = (segment: ChartSegment, date: string): null | number =>
    segment.values.find(point => point.date === date)?.value ?? null;

/** Rows of cells, the first column left-aligned, the numbers right-aligned, two spaces between. */
const table = (rows: readonly string[][]): string => {
    const widths = rows[0]?.map((_, column) => Math.max(...rows.map(row => row[column]?.length ?? 0))) ?? [];

    return rows.map(row => row.map((cell, column) => (column === 0
        ? cell.padEnd(widths[column] ?? 0)
        : cell.padStart(widths[column] ?? 0))).join('  ').trimEnd()).join('\n');
};

/** Private to `analytics chart`: a heading, then one row per segment and one column per period. */
export const renderChart = ({ data, meta }: ChartResponse): string => {
    const { query } = meta;
    const heading = [data.title, query.revenue_basis, data.unit].filter(part => part !== undefined).join(', ');
    const period = [(query.filters.date ?? []).join(' – '), query.period_unit, `timezone ${query.timezone}`].join(', ');

    if (data.segments.length === 0) {
        return [heading, period, '', 'No data for this period.'].join('\n');
    }

    const money = isCurrency(data.unit);

    const format = (value: null | number): string => {
        if (value === null) {
            return NO_VALUE;
        }

        return money ? value.toFixed(2) : String(value);
    };

    const dates = periodStarts(data.segments);

    const rows = [
        ['', 'Total', ...dates],
        ...data.segments.map(segment => [
            segmentLabel(segment),
            format(segment.value),
            ...dates.map(date => format(valueAt(segment, date))),
        ]),
    ];

    return [heading, period, '', table(rows)].join('\n');
};

/** RFC 4180: a field with a quote, a comma or a line break is quoted, and its quotes doubled. */
const csvField = (field: string): string => (/[",\r\n]/.test(field) ? `"${field.replaceAll('"', '""')}"` : field);

/** Raw numbers for a machine, and an empty field where the human view prints a dash. */
const csvValue = (value: null | number): string => (value === null ? '' : String(value));

/** `segment,total,<date>...`, one row per segment; a chart without segments is the header alone. */
export const renderCsv = ({ data }: ChartResponse): string => {
    const dates = periodStarts(data.segments);

    const rows = [
        ['segment', 'total', ...dates],
        ...data.segments.map(segment => [
            segmentLabel(segment),
            csvValue(segment.value),
            ...dates.map(date => csvValue(valueAt(segment, date))),
        ]),
    ];

    return rows.map(row => row.map(field => csvField(field)).join(',')).join('\n');
};
