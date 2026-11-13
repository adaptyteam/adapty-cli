import { readFileSync } from 'node:fs';

import { ValidationError } from '../../../../../sdk/core/errors.js';

import type { PushOfferBody } from '../../../../../sdk/adapty/index.js';
import type { Issue } from '../../../../../sdk/core/errors.js';

/** The body flags as parsed: the command's flags without app, product, store and the run flags. */
export type BodyFlags = {
    'currency'?: string | undefined;
    'discount-percent'?: number | undefined;
    'eligibility'?: NonNullable<PushOfferBody['google']>['eligibility'] | undefined;
    'end-date'?: string | undefined;
    'mode'?: PushOfferBody['payment_mode'] | undefined;
    'offer'?: string | undefined;
    'offer-tag'?: string[] | undefined;
    'paid-subscription-months'?: number | undefined;
    'period'?: PushOfferBody['period'] | undefined;
    'periods'?: number | undefined;
    'price'?: string | undefined;
    'priority'?: PushOfferBody['priority'] | undefined;
    'region-price'?: PushOfferBody['region_prices'] | undefined;
    'regions'?: string[] | undefined;
    'round'?: NonNullable<PushOfferBody['price']>['rounding'] | undefined;
    'since-last-subscribed-max-months'?: number | undefined;
    'since-last-subscribed-min-months'?: number | undefined;
    'start-date'?: string | undefined;
    'store-offer-id'?: string | undefined;
    'title'?: string | undefined;
    'type'?: PushOfferBody['offer_type'] | undefined;
    'wait-between-offers-months'?: number | undefined;
};

/** Only a-z: `toUpperCase` turns `ß` into `SS`, which would pass a 2-letter rule. */
export const upperAscii = (value: string): string => value.replaceAll(/[a-z]/g, char => char.toUpperCase());

/** An object without the keys whose value is undefined, or undefined when none is left. */
const present = <T extends Record<string, unknown>>(value: T): T | undefined => {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);

    return entries.length === 0 ? undefined : Object.fromEntries(entries) as T;
};

/**
 * The body the flags describe; a flag not given leaves its field out, so the server default applies. The
 * required fields stay undefined when missing: the sdk rule names them, as it does for a file.
 */
export const bodyOfFlags = (flags: BodyFlags): Readonly<Record<string, unknown>> => {
    const currency = flags.currency === undefined ? undefined : upperAscii(flags.currency.trim());

    const price = flags.price === undefined
        ? undefined
        : present({ amount: flags.price, currency, rounding: flags.round });

    const winBack = present({
        paid_subscription_months: flags['paid-subscription-months'],
        since_last_subscribed_max_months: flags['since-last-subscribed-max-months'],
        since_last_subscribed_min_months: flags['since-last-subscribed-min-months'],
        wait_between_offers_months: flags['wait-between-offers-months'],
    });

    const google = present({
        discount_percent: flags['discount-percent'],
        eligibility: flags.eligibility,
        offer_tags: flags['offer-tag'],
    });

    return present({
        adapty_offer_id: flags.offer,
        end_date: flags['end-date'],
        google,
        number_of_periods: flags.periods,
        offer_type: flags.type,
        payment_mode: flags.mode,
        period: flags.period,
        price,
        priority: flags.priority,
        region_prices: flags['region-price'],
        regions: flags.regions,
        start_date: flags['start-date'],
        store_offer_id: flags['store-offer-id'],
        title: flags.title,
        win_back: winBack,
    }) ?? {};
};

const invalidFile = (message: string): never => {
    throw new ValidationError([{ message, path: 'file' }]);
};

/** The whole body from a JSON file, passed on as written: fields this version does not know reach the server too. */
export const readBodyFile = (path: string): Readonly<Record<string, unknown>> => {
    let text: string;

    try {
        text = readFileSync(path, 'utf8');
    } catch (error) {
        return invalidFile(`cannot be read: ${error instanceof Error ? error.message : String(error)}`);
    }

    let body: unknown;

    try {
        body = JSON.parse(text);
    } catch (error) {
        return invalidFile(`is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }

    return typeof body === 'object' && body !== null && !Array.isArray(body)
        ? body as Readonly<Record<string, unknown>>
        : invalidFile('must hold one JSON object: the body of the push');
};

/**
 * The flag (camelCase, as an Issue path) behind each body field. `win_back` and `google` themselves have no
 * flag: their problems are worded with the field name.
 */
const FLAG_OF_FIELD: Readonly<Record<string, string>> = {
    'adapty_offer_id': 'offer',
    'end_date': 'endDate',
    'google.discount_percent': 'discountPercent',
    'google.eligibility': 'eligibility',
    'google.offer_tags': 'offerTag',
    'number_of_periods': 'periods',
    'offer_type': 'type',
    'payment_mode': 'mode',
    'period': 'period',
    'price': 'price',
    'price.amount': 'price',
    'price.currency': 'currency',
    'price.rounding': 'round',
    'priority': 'priority',
    'region_prices': 'regionPrice',
    'regions': 'regions',
    'start_date': 'startDate',
    'store_offer_id': 'storeOfferId',
    'title': 'title',
    'win_back.paid_subscription_months': 'paidSubscriptionMonths',
    'win_back.since_last_subscribed_max_months': 'sinceLastSubscribedMaxMonths',
    'win_back.since_last_subscribed_min_months': 'sinceLastSubscribedMinMonths',
    'win_back.wait_between_offers_months': 'waitBetweenOffersMonths',
};

/**
 * The sdk names the body field; the user typed a flag or wrote a file. With flags an issue names the flag, from a
 * file it names the field as written there, under `--file`.
 */
export const issuesForUser = (issues: readonly Issue[], fromFile: boolean): Issue[] => issues.map((issue) => {
    if (issue.path === undefined) {
        return issue;
    }

    if (fromFile) {
        return { ...issue, message: `${issue.path}: ${issue.message}`, path: 'file' };
    }

    const flag = FLAG_OF_FIELD[issue.path];

    if (flag !== undefined) {
        return { ...issue, path: flag };
    }

    if (issue.path === 'win_back') {
        return { message: 'the win-back flags are only for --type win_back' };
    }

    return issue.path === 'google'
        ? { message: 'the Google Play flags (--eligibility, --offer-tag, --discount-percent) do not go with --store app_store' }
        : { message: `${issue.path}: ${issue.message}` };
});
