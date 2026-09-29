import type { ReportResponse } from '../../../../../sdk/attribution/index.js';

/** A metric the backend could not compute is null, and printing it as 0 would be a lie. */
const NOT_COMPUTED = '—';

const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) {
        return NOT_COMPUTED;
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    return JSON.stringify(value);
};

/**
 * Field names stay as the server sends them: they are the names `--metrics`, `--group-by`, `--filter`
 * and `--sort` take, so what a reader sees is what they can type next.
 */
const block = (record: Record<string, unknown>): string[] =>
    Object.entries(record).map(([name, value]) => `${name}: ${formatValue(value)}`);

/** Private to `attribution report`: one labelled block per row, `---` between rows, then the totals. */
export const renderReport = (report: ReportResponse): string => {
    const { rows, totals } = report.data;

    const body = rows.length === 0
        ? 'No rows for this period.'
        : rows.map(row => block(row).join('\n')).join('\n---\n');

    return totals === null ? body : `${body}\n\n${['Totals', ...block(totals)].join('\n')}`;
};
