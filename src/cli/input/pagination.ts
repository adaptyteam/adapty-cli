import { Flags } from '@oclif/core';

import type { PageParams } from '../../sdk/adapty/index.js';

/** The published defaults, so a migrated `list` asks for the same page as an untouched one. */
export const paginationFlags = {
    'page': Flags.integer({ default: 1, description: 'Page number', min: 1 }),
    'page-size': Flags.integer({ default: 20, description: 'Items per page (max 100)', max: 100, min: 1 }),
};

/** The one place where flag names meet sdk field names. */
export const pageParams = (flags: { 'page': number; 'page-size': number }): PageParams =>
    ({ page: flags.page, pageSize: flags['page-size'] });

/**
 * One page of a list that pages by cursor: no page numbers, the next page starts at the cursor of the answer.
 * Separate from `paginationFlags` on purpose: a page-number list keeps its flags as published. With no
 * `--page-size` the server picks the size.
 */
export const cursorPageFlags = {
    'cursor': Flags.string({
        description: 'Where the page starts: the next_cursor of the previous page. Give the same filters and time zone '
            + 'as that page',
    }),
    'page-size': Flags.integer({ description: 'Items per page; the server default when omitted', max: 100, min: 1 }),
};

/** The one place where the cursor flags meet sdk field names. */
export const cursorPageParams = (flags: { 'cursor'?: string | undefined; 'page-size'?: number | undefined }) =>
    ({ cursor: flags.cursor, pageSize: flags['page-size'] });
