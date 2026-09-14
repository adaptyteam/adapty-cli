import { printResponse } from '../../lib/output.js';

/**
 * A server record as the published CLI prints it: snake_case keys as labels, nested objects
 * indented, empty values dropped.
 *
 * The formatter still lives in src/lib and writes through a callback; this wraps it into the shape
 * of a view (value in, string out), so commands do not depend on where it lives. The cast is that
 * formatter's parameter type — it walks whatever it is given at runtime.
 */
export const renderRecord = (record: object): string => {
    const lines: string[] = [];

    printResponse(record as Record<string, unknown>, line => lines.push(line));

    return lines.join('\n');
};
