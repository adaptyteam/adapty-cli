import { Args } from '@oclif/core';

import { uuidParser } from './uuid.js';

export const offerIdArg = {
    offer_id: Args.string({
        description: 'Offer ID (UUID)',
        parse: uuidParser('Invalid offer ID format.'),
        required: true,
    }),
};
