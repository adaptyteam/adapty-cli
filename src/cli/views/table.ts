/** Rows of cells, the first column left-aligned, every other column right-aligned, two spaces between. */
export const table = (rows: readonly string[][]): string => {
    const widths = rows[0]?.map((_, column) => Math.max(...rows.map(row => row[column]?.length ?? 0))) ?? [];

    return rows.map(row => row.map((cell, column) => (column === 0
        ? cell.padEnd(widths[column] ?? 0)
        : cell.padStart(widths[column] ?? 0))).join('  ').trimEnd()).join('\n');
};
