import { Flags } from '@oclif/core';

import { usageError } from '../errors.js';

import { parseJson } from './json.js';

/** `null` is the literal that clears a nullable field; anything else goes to `parse`. */
const nullable = <T>(parse: (input: string) => Promise<T>) => (input: string): Promise<null | T> => (input === 'null'
    ? Promise.resolve(null)
    : parse(input));

const imageId = (input: string): Promise<number> => (/^\d+$/.test(input)
    ? Promise.resolve(Number(input))
    : Promise.reject(usageError('Expected an image ID (an integer) or null.')));

/** The paywall fields after `title` and `product-id`; `create` takes them as optional, `update` as required. */
export const paywallFieldFlags = {
    'builder-screenshot-id': Flags.custom<null | number>({
        description: 'Image ID of the builder screenshot, or null for none',
        parse: nullable(imageId),
    })(),
    'remote-configs': Flags.string({
        description: 'JSON array of remote config entries: [{locale, data}]. `data` is a JSON string. A write replaces the whole list; [] deletes all.',
    }),
    'screenshot-id': Flags.custom<null | number>({
        description: 'Image ID of the paywall screenshot, or null for none',
        parse: nullable(imageId),
    })(),
    'use-paywall-builder-v4': Flags.boolean({
        allowNo: true,
        description: 'Whether the paywall uses Paywall Builder. Send the value from `get`: false removes the builder layout from devices.',
    }),
    'web-purchase-url': Flags.custom<null | string>({
        description: 'Web purchase URL, or null for none',
        parse: nullable(input => Promise.resolve(input)),
    })(),
};

type PaywallFlags = {
    'builder-screenshot-id'?: null | number | undefined;
    'product-id'?: string[] | undefined;
    'remote-configs'?: string | undefined;
    'screenshot-id'?: null | number | undefined;
    'title'?: string | undefined;
    'use-paywall-builder-v4'?: boolean | undefined;
    'web-purchase-url'?: null | string | undefined;
};

/** The fields of the request body that the flags gave; a flag that was not given has no key. */
export const paywallFieldsFromFlags = (flags: PaywallFlags): Record<string, unknown> => {
    const fields: Record<string, unknown> = {
        builder_screenshot_id: flags['builder-screenshot-id'],
        product_ids: flags['product-id'],
        remote_configs: flags['remote-configs'] === undefined ? undefined : parseJson(flags['remote-configs'], '--remote-configs'),
        screenshot_id: flags['screenshot-id'],
        title: flags.title,
        use_paywall_builder_v4: flags['use-paywall-builder-v4'],
        web_purchase_url: flags['web-purchase-url'],
    };

    return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
};

/** Each field that `update` requires, with the flag that gives it. */
const REQUIRED_FIELDS = [
    ['title', '--title'],
    ['product_ids', '--product-id'],
    ['remote_configs', '--remote-configs'],
    ['use_paywall_builder_v4', '--use-paywall-builder-v4 or --no-use-paywall-builder-v4'],
    ['screenshot_id', '--screenshot-id'],
    ['builder_screenshot_id', '--builder-screenshot-id'],
    ['web_purchase_url', '--web-purchase-url'],
] as const;

/** Every missing flag in one exit-2 error; nothing is sent. */
export const requirePaywallFields = (fields: Record<string, unknown>): void => {
    const missing = REQUIRED_FIELDS.filter(([key]) => !(key in fields)).map(([, flag]) => flag);

    if (missing.length > 0) {
        throw usageError(
            `Missing flags: ${missing.join(', ')}. Give every field (null is valid for --screenshot-id, `
            + '--builder-screenshot-id and --web-purchase-url), or send the whole body with --file PATH|-.',
        );
    }
};
