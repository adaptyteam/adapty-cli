import { printList } from '../../lib/output.js';

import type { Paginated, Pagination } from '../../sdk/adapty/index.js';

/**
 * A page as the published CLI prints it: every item a labelled block, `---` between them, then a
 * blank line and the pagination footer. Wraps src/lib the same way views/record.ts does.
 */
export const renderPage = <T extends object>(page: Paginated<T>): string => {
    const lines: string[] = [];

    printList(page.data as Record<string, unknown>[], line => lines.push(line), page.meta.pagination);

    return lines.join('\n');
};

/** The footer line alone, for a view that prints its own blocks: `Page 1 of 3 (50 total)`. */
export const renderFooter = (pagination: Pagination): string => {
    const lines: string[] = [];

    printList([], line => lines.push(line), pagination);

    return lines.join('\n').trimStart();
};
