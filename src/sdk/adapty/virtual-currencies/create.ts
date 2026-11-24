import { validateMappingItems } from './mappings.js';

import type { MappingItem } from './model.js';
import type { Issue } from '../../core/errors.js';

export type CreateVirtualCurrencyInput = {
    code: string;
    description?: string | undefined;
    /** Left out: a currency with no mapping. */
    mappings?: MappingItem[] | undefined;
    name: string;
};

/** The code and the name are the server's rules; only the mapping list form is checked here. */
export const validateCreateVirtualCurrency = (input: CreateVirtualCurrencyInput): Issue[] =>
    (input.mappings === undefined ? [] : validateMappingItems(input.mappings));

export const createBody = (input: CreateVirtualCurrencyInput): Record<string, unknown> => ({
    code: input.code,
    name: input.name,
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(input.mappings === undefined ? {} : { mappings: input.mappings }),
});
