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
