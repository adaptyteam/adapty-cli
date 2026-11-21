import { Args, Flags } from '@oclif/core';

import { billingPlans } from '../../sdk/adapty/index.js';

import { uuidParser } from './uuid.js';

export const offerIdArg = {
    offer_id: Args.string({
        description: 'Offer ID (UUID)',
        parse: uuidParser('Invalid offer ID format.'),
        required: true,
    }),
};

/** The plan of the App Store side of an offer; `monthly` needs the monthly plan of the product. */
export const billingPlanFlag = (whenLeftOut: string) => ({
    'billing-plan': Flags.option({
        description: `App Store billing: upfront, or monthly with a 12-month commitment (the product needs its monthly plan, `
            + `see \`products monthly-plan set\`). ${whenLeftOut}`,
        options: billingPlans,
    })(),
});
