import { Flags } from '@oclif/core';

import { usageError } from '../errors.js';

const UUID_PATTERN = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

const isUuid = (value: string): boolean => UUID_PATTERN.test(value);

/**
 * Checking the shape of a value is the parser's job, so a run() never starts with one. oclif turns
 * a *flag* parser's failure into exit 2 itself but passes an *arg* parser's error through, hence
 * the explicit code. The hint is per resource: `adapty apps list` only helps for an app id.
 */
export const uuidParser = (hint: string) => (input: string): Promise<string> => (isUuid(input)
    ? Promise.resolve(input)
    : Promise.reject(usageError(hint)));

export const productFlag = {
    product: Flags.string({
        description: 'Product ID (UUID)',
        parse: uuidParser('Invalid product ID format.'),
        required: true,
    }),
};

export const offerFlag = {
    offer: Flags.string({
        description: 'Offer ID (UUID)',
        parse: uuidParser('Invalid offer ID format.'),
        required: true,
    }),
};
