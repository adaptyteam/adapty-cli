import { Args, Flags } from '@oclif/core';

import { uuidParser } from './uuid.js';

/** The published wording of both the `app_id` arg and the `--app` flag. */
const APP_ID_HINT = 'Invalid app ID format. Run `adapty apps list` to find your app ID.';

/** Spread into a command: `static args = { ...appIdArg }`. Texts kept as published. */
export const appIdArg = {
    app_id: Args.string({
        description: 'App ID (UUID)',
        parse: uuidParser(APP_ID_HINT),
        required: true,
    }),
};

/** `appIdArg` as a flag: `static flags = { ...appIdFlag }`. Texts kept as the published `--app`. */
export const appIdFlag = {
    app: Flags.string({
        description: 'App ID (UUID)',
        parse: uuidParser(APP_ID_HINT),
        required: true,
    }),
};
