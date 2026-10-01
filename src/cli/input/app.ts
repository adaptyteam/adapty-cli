import { Args, Flags } from '@oclif/core';

import { usageError } from '../errors.js';

const UUID_PATTERN = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/** The published wording of both the `app_id` arg and the `--app` flag. */
const APP_ID_HINT = 'Invalid app ID format. Run `adapty apps list` to find your app ID.';

const isUuid = (value: string): boolean => UUID_PATTERN.test(value);

/**
 * Checking the shape of a value is the parser's job, so a run() never starts with one. oclif turns
 * a *flag* parser's failure into exit 2 itself but passes an *arg* parser's error through, hence
 * the explicit code. The hint is per resource: `adapty apps list` only helps for an app id.
 */
const uuidParser = (hint: string) => (input: string): Promise<string> => (isUuid(input)
    ? Promise.resolve(input)
    : Promise.reject(usageError(hint)));

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
