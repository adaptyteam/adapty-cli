/** What a CSV cell can hold: the scalar values of an API answer. */
export type Cell = boolean | null | number | string | undefined;

/**
 * RFC 4180: a field with a comma, a double quote or a line break goes in double quotes, and a quote inside is
 * doubled. A missing value (null) is an empty cell, so it never reads as 0; an empty text (a group key, for
 * example) is `""`, so it never reads as a missing one.
 */
const csvCell = (value: Cell): string => {
    if (value === null || value === undefined) {
        return '';
    }

    if (value === '') {
        return '""';
    }

    const text = String(value);

    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export const csvLine = (cells: readonly Cell[]): string => cells.map(cell => csvCell(cell)).join(',');
