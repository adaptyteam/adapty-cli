import { Args, Flags } from '@oclif/core';

import { usageError } from '../errors.js';

import { uuidParser } from './uuid.js';

const PRODUCT_ID_HINT = 'Invalid product ID format.';

export const productFlag = {
    product: Flags.string({
        description: 'Product ID (UUID)',
        parse: uuidParser(PRODUCT_ID_HINT),
        required: true,
    }),
};

export const productIdArg = {
    product_id: Args.string({
        description: 'Product ID (UUID)',
        parse: uuidParser(PRODUCT_ID_HINT),
        required: true,
    }),
};

/** A plain decimal, no sign, exponent or hex: the range is a rule of the sdk. */
export const isAmount = (text: string): boolean => /^\d+(\.\d+)?$/.test(text);

export const amountFlag = Flags.custom<number>({
    parse: (input) => {
        const amount = input.trim();

        return isAmount(amount)
            ? Promise.resolve(Number(amount))
            : Promise.reject(usageError(`Expected a number, got "${input}".`));
    },
});
