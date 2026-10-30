import { ValidationError } from '../../../../../sdk/core/errors.js';

/** A row of the file with the 1-based line it starts on. */
export type CsvRow = {
    cells: string[];
    line: number;
};

const malformed = (what: string, line: number): never => {
    throw new ValidationError([{ message: `is not a valid CSV: ${what} at line ${line}`, path: 'file' }]);
};

/**
 * RFC 4180: a quoted field may hold commas and line breaks, and a quote inside is doubled. A quote opens a field only
 * at its start; elsewhere it is a plain character. A BOM is dropped, blank lines are skipped.
 */
export const parseCsv = (text: string): CsvRow[] => {
    const rows: CsvRow[] = [];
    let cells: string[] = [];
    let field = '';
    let quoted = false;
    let line = 1;
    let rowLine = 1;
    let quoteLine = 1;

    const endField = (): void => {
        cells.push(field);
        field = '';
    };

    const endRow = (): void => {
        endField();
        rows.push({ cells, line: rowLine });
        cells = [];
    };

    const source = text.codePointAt(0) === 0xFE_FF ? text.slice(1) : text;

    for (let index = 0; index < source.length; index += 1) {
        const char = source.charAt(index);

        if (quoted) {
            if (char !== '"') {
                field += char;
            } else if (source.charAt(index + 1) === '"') {
                field += '"';
                index += 1;
            } else if (!['', ',', '\n', '\r'].includes(source.charAt(index + 1))) {
                malformed('a closing quote is followed by a character other than a comma or a line break', line);
            } else {
                quoted = false;
            }
        } else if (char === '"' && field === '') {
            quoted = true;
            quoteLine = line;
        } else if (char === ',') {
            endField();
        } else if (char === '\n') {
            endRow();
            rowLine = line + 1;
        } else if (char !== '\r') {
            field += char;
        }

        if (char === '\n') {
            line += 1;
        }
    }

    if (quoted) {
        malformed('a quote is not closed', quoteLine);
    }

    if (field !== '' || cells.length > 0) {
        endRow();
    }

    return rows.filter(row => row.cells.some(cell => cell.trim() !== ''));
};
