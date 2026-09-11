import { printList } from '../../lib/output.js';

import type { Paginated } from '../../sdk/adapty/index.js';

/**
 * A page as the published CLI prints it: every item a labelled block, `---` between them, then a
 * blank line and the pagination footer. Wraps src/lib the same way views/record.ts does.
 */
export const renderPage = <T extends object>(page: Paginated<T>): string => {
    const lines: string[] = [];

    printList(page.data as Record<string, unknown>[], line => lines.push(line), page.meta.pagination);

    return lines.join('\n');
};
