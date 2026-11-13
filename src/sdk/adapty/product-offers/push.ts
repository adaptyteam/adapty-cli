/**
 * Pushing an offer into the real store account: the request body, the rules a body must pass before it is
 * sent, and the two answers (the preview and the push). The body is the server's own snake_case shape,
 * because it is also what a caller writes into a file by hand; a camelCase input would only add a map that
 * drops whatever field the server learns next.
 */

import { ISO_DATE, validateDayRange } from '../../core/dates.js';

import type { ProductOffer } from './model.js';
import type { Issue } from '../../core/errors.js';
import type { ProductStore } from '../products/index.js';

export const pushOfferTypes = ['introductory', 'promotional', 'win_back'] as const;
export type PushOfferType = (typeof pushOfferTypes)[number];

export const paymentModes = ['free_trial', 'pay_as_you_go', 'pay_up_front'] as const;
export type PaymentMode = (typeof paymentModes)[number];

export const offerPeriods = [
    'three_days',
    'one_week',
    'two_weeks',
    'one_month',
    'two_months',
    'three_months',
    'six_months',
    'one_year',
] as const;
export type OfferPeriod = (typeof offerPeriods)[number];

export const priceRoundings = ['exact', 'nearest', 'up', 'down'] as const;
export type PriceRounding = (typeof priceRoundings)[number];

export const offerPriorities = ['high', 'normal'] as const;
export type OfferPriority = (typeof offerPriorities)[number];

export const googleEligibilities = ['acquisition', 'upgrade', 'developer_determined'] as const;
export type GoogleEligibility = (typeof googleEligibilities)[number];

/** The body of the preview and of the push alike. A field left out takes the server default. */
export type PushOfferBody = {
    /** Add this store offer to an existing Adapty offer, e.g. the other store of the same offer. */
    adapty_offer_id?: string;
    end_date?: string;
    google?: {
        discount_percent?: number;
        eligibility?: GoogleEligibility;
        offer_tags?: string[];
    };
    /** 1-12, default 1; 1 for pay_up_front. */
    number_of_periods?: number;
    offer_type: PushOfferType;
    payment_mode: PaymentMode;
    period: OfferPeriod;
    /** A decimal string, so the amount reaches the server exactly as typed. */
    price?: { amount: string; currency?: string; rounding?: PriceRounding };
    priority?: OfferPriority;
    region_prices?: { amount: string; region_code: string }[];
    /** Alpha-2 codes; every region of the store when left out. */
    regions?: string[];
    start_date?: string;
    /** App Store promo code or win-back offer id, or Google Play offer id; App Store introductory offers have none. */
    store_offer_id?: string;
    title: string;
    win_back?: {
        paid_subscription_months?: number;
        since_last_subscribed_max_months?: number;
        since_last_subscribed_min_months?: number;
        wait_between_offers_months?: number;
    };
};

/**
 * What the preview and the push take. `body` is a plain object because a file may carry fields this
 * version does not know: they pass through to the server unchanged.
 */
export type PushOfferInput = {
    body: PushOfferBody | Readonly<Record<string, unknown>>;
    store: ProductStore;
};

/** A problem of one region, or of the whole push when `region_code` is null. */
export type OfferPushIssue = {
    error_code: string;
    message: string;
    region_code: null | string;
};

export type OfferPushPreviewRegion = {
    currency: null | string;
    /** Whether the store already has the offer in this region: the push skips it. */
    exists: boolean;
    price: null | string;
    region_code: string;
    store_price_id: null | string;
    /** The current price of the subscription in this region. */
    subscription_price: null | string;
};

/** Nothing is written. A refusal comes back as `errors` in a 200 answer, not as an HTTP error. */
export type OfferPushPreview = {
    errors: OfferPushIssue[];
    regions: OfferPushPreviewRegion[];
    store_offer_id: string;
    warnings: string[];
};

export type OfferPushStoreResult = {
    created: number;
    failed: number;
    failures: OfferPushIssue[];
    skipped: number;
    store_offer_id: string;
};

export type OfferPushResult = {
    offer: null | ProductOffer;
    store_result: OfferPushStoreResult;
};

/** The failure of a region the store did not finish before the server's deadline: a repeat of the push finishes it. */
export const DEADLINE_EXCEEDED = 'deadline_exceeded';

export const unfinishedRegions = (result: OfferPushResult): OfferPushIssue[] =>
    result.store_result.failures.filter(failure => failure.error_code === DEADLINE_EXCEEDED);

/** Every region the push writes and skips, as the preview says. */
export const plannedRegions = (preview: OfferPushPreview): { create: number; skip: number } => ({
    create: preview.regions.filter(region => !region.exists).length,
    skip: preview.regions.filter(region => region.exists).length,
});

const GOOGLE_OFFER_ID = /^[a-z\d][a-z\d-]{0,62}$/;
const REGION = /^[A-Z]{2}$/;
const CURRENCY = /^[A-Z]{3}$/;
const AMOUNT = /^\d+(\.\d+)?$/;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const oneOf = (values: readonly string[], value: unknown): boolean => typeof value === 'string' && values.includes(value);

const isInteger = (value: unknown, min: number, max: number): boolean =>
    typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

const choice = (values: readonly string[]): string => `must be one of ${values.join(', ')}`;

/** Each issue's path is the body field it belongs to, nested ones dotted (`price.amount`). */
const typeIssues = (body: Readonly<Record<string, unknown>>, store: ProductStore): Issue[] => {
    const issues: Issue[] = [];

    if (typeof body.title !== 'string' || body.title.trim() === '') {
        issues.push({ message: 'is required and must not be empty', path: 'title' });
    }

    if (!oneOf(pushOfferTypes, body.offer_type)) {
        issues.push({ message: choice(pushOfferTypes), path: 'offer_type' });
    } else if (body.offer_type === 'win_back' && store === 'play_store') {
        issues.push({ message: 'win_back offers are App Store only', path: 'offer_type' });
    }

    if (!oneOf(paymentModes, body.payment_mode)) {
        issues.push({ message: choice(paymentModes), path: 'payment_mode' });
    }

    if (!oneOf(offerPeriods, body.period)) {
        issues.push({ message: choice(offerPeriods), path: 'period' });
    }

    if (body.number_of_periods !== undefined) {
        if (!isInteger(body.number_of_periods, 1, 12)) {
            issues.push({ message: 'must be a whole number from 1 to 12', path: 'number_of_periods' });
        } else if (body.payment_mode === 'pay_up_front' && body.number_of_periods !== 1) {
            issues.push({ message: 'must be 1 for pay_up_front', path: 'number_of_periods' });
        }
    }

    if (body.priority !== undefined && !oneOf(offerPriorities, body.priority)) {
        issues.push({ message: choice(offerPriorities), path: 'priority' });
    }

    if (body.adapty_offer_id !== undefined && (typeof body.adapty_offer_id !== 'string' || body.adapty_offer_id.trim() === '')) {
        issues.push({ message: 'must be an offer id', path: 'adapty_offer_id' });
    }

    return issues;
};

const storeOfferIdIssues = (body: Readonly<Record<string, unknown>>, store: ProductStore): Issue[] => {
    const id = body.store_offer_id;

    if (id === undefined) {
        return [];
    }

    if (typeof id !== 'string' || id.trim() === '') {
        return [{ message: 'must not be empty', path: 'store_offer_id' }];
    }

    if (store === 'app_store' && body.offer_type === 'introductory') {
        return [{ message: 'an App Store introductory offer has no offer id: leave it out', path: 'store_offer_id' }];
    }

    if (store === 'play_store' && !GOOGLE_OFFER_ID.test(id)) {
        return [{
            message: 'a Google Play offer id is 1-63 characters: lower-case letters, digits and hyphens, starting with a letter or digit',
            path: 'store_offer_id',
        }];
    }

    return [];
};

const priceIssues = (body: Readonly<Record<string, unknown>>): Issue[] => {
    const issues: Issue[] = [];
    const { price } = body;

    if (price !== undefined) {
        if (!isRecord(price)) {
            return [{ message: 'must be an object with an amount', path: 'price' }];
        }

        if (typeof price.amount !== 'string' || !AMOUNT.test(price.amount)) {
            issues.push({ message: 'must be a decimal number written as a string, e.g. "4.99"', path: 'price.amount' });
        }

        if (price.currency !== undefined && (typeof price.currency !== 'string' || !CURRENCY.test(price.currency))) {
            issues.push({ message: 'must be 3 upper-case letters, e.g. EUR', path: 'price.currency' });
        }

        if (price.rounding !== undefined && !oneOf(priceRoundings, price.rounding)) {
            issues.push({ message: choice(priceRoundings), path: 'price.rounding' });
        }
    }

    if (body.region_prices !== undefined) {
        const rows = Array.isArray(body.region_prices) ? (body.region_prices as unknown[]) : undefined;

        const valid = rows?.every(row => isRecord(row)
            && typeof row.region_code === 'string' && REGION.test(row.region_code)
            && typeof row.amount === 'string' && AMOUNT.test(row.amount));

        if (valid !== true) {
            issues.push({ message: 'each must be a 2-letter region code and a decimal amount, e.g. DE=4.99', path: 'region_prices' });
        }
    }

    if (body.regions !== undefined) {
        const codes = Array.isArray(body.regions) ? (body.regions as unknown[]) : undefined;

        if (codes?.every(code => typeof code === 'string' && REGION.test(code)) !== true) {
            issues.push({ message: 'must be 2-letter region codes, e.g. US,DE', path: 'regions' });
        }
    }

    return issues;
};

const dateIssues = (body: Readonly<Record<string, unknown>>): Issue[] => {
    const start = body.start_date;
    const end = body.end_date;

    if (start === undefined && end === undefined) {
        return [];
    }

    if (typeof start === 'string' && typeof end === 'string') {
        return validateDayRange(start, end, { from: 'start_date', to: 'end_date' });
    }

    // One end alone: the same day as both ends checks that it is a real day
    return [['start_date', start], ['end_date', end]].flatMap(([path, value]) => {
        if (value === undefined) {
            return [];
        }

        return typeof value === 'string' && ISO_DATE.test(value)
            ? validateDayRange(value, value, { from: path as string, to: path as string })
            : [{ message: 'must be a date in YYYY-MM-DD form', path: path as string }];
    });
};

const winBackIssues = (body: Readonly<Record<string, unknown>>): Issue[] => {
    const { win_back: winBack } = body;

    if (winBack === undefined) {
        return [];
    }

    if (body.offer_type !== 'win_back') {
        return [{ message: 'is only for a win_back offer', path: 'win_back' }];
    }

    if (!isRecord(winBack)) {
        return [{ message: 'must be an object', path: 'win_back' }];
    }

    return ['paid_subscription_months', 'since_last_subscribed_min_months', 'since_last_subscribed_max_months', 'wait_between_offers_months']
        .filter(key => winBack[key] !== undefined && !isInteger(winBack[key], 0, Number.MAX_SAFE_INTEGER))
        .map(key => ({ message: 'must be a whole number of months', path: `win_back.${key}` }));
};

const googleIssues = (body: Readonly<Record<string, unknown>>, store: ProductStore): Issue[] => {
    const { google } = body;

    if (google === undefined) {
        return [];
    }

    if (store !== 'play_store') {
        return [{ message: 'is a Google Play field: it does not go with the App Store', path: 'google' }];
    }

    if (!isRecord(google)) {
        return [{ message: 'must be an object', path: 'google' }];
    }

    const issues: Issue[] = [];

    if (google.eligibility !== undefined && !oneOf(googleEligibilities, google.eligibility)) {
        issues.push({ message: choice(googleEligibilities), path: 'google.eligibility' });
    }

    if (google.offer_tags !== undefined
        && !(Array.isArray(google.offer_tags) && (google.offer_tags as unknown[]).every(tag => typeof tag === 'string' && tag !== ''))) {
        issues.push({ message: 'must be a list of tags', path: 'google.offer_tags' });
    }

    if (google.discount_percent !== undefined && !isInteger(google.discount_percent, 1, 99)) {
        issues.push({ message: 'must be a whole number from 1 to 99', path: 'google.discount_percent' });
    }

    return issues;
};

/**
 * What can be refused without the store: shapes, ranges and the fields of the other store. Whether the
 * product, the prices and the store account allow the offer is what the preview answers.
 */
export const validatePushOffer = (input: PushOfferInput): Issue[] => {
    const body = input.body as Readonly<Record<string, unknown>>;

    return [
        ...typeIssues(body, input.store),
        ...storeOfferIdIssues(body, input.store),
        ...priceIssues(body),
        ...dateIssues(body),
        ...winBackIssues(body),
        ...googleIssues(body, input.store),
    ];
};
