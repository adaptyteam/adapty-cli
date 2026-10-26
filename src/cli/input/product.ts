import { Flags } from '@oclif/core';

import { uuidParser } from './uuid.js';

export const productFlag = {
    product: Flags.string({
        description: 'Product ID (UUID)',
        parse: uuidParser('Invalid product ID format.'),
        required: true,
    }),
};
