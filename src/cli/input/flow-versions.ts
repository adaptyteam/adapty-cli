import { Args } from '@oclif/core';

import { uuidParser } from './uuid.js';

/** The version argument of the `flows versions` commands; the flow argument comes first. */
export const flowVersionIdArg = {
    version_id: Args.string({
        description: 'Flow version ID (UUID), as `flows versions list` shows it',
        parse: uuidParser('Invalid flow version ID format. Run `adapty flows versions list FLOW_ID --app <app>` to find it.'),
        required: true,
    }),
};
