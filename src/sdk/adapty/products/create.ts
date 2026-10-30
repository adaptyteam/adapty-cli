import type { ProductPeriod } from './model.js';
import type { Issue } from '../../core/errors.js';

export type CreateProductInput = {
    accessLevelId: string;
    androidBasePlanId?: string | undefined;
    androidProductId?: string | undefined;
    iosProductId?: string | undefined;
    paddlePriceId?: string | undefined;
    paddleProductId?: string | undefined;
    period: ProductPeriod;
    priceUsd?: number | undefined;
    stripePriceId?: string | undefined;
    stripeProductId?: string | undefined;
    title: string;
};

type Field = keyof CreateProductInput;

const storeIdFields = [
    'iosProductId',
    'androidProductId',
    'androidBasePlanId',
    'stripeProductId',
    'stripePriceId',
    'paddleProductId',
    'paddlePriceId',
] as const;

/** The server takes the ids of a Stripe or Paddle pair both or neither. */
const pairIssues = (input: CreateProductInput, a: Field, b: Field): Issue[] => {
    if ((input[a] === undefined) === (input[b] === undefined)) {
        return [];
    }

    const [missing, given] = input[a] === undefined ? [a, b] : [b, a];

    return [{ fields: [given], message: `required with {${given}}`, path: missing }];
};

export const validateCreateProduct = (input: CreateProductInput): Issue[] => {
    const issues: Issue[] = [];

    if (input.title.trim() === '') {
        issues.push({ message: 'must not be empty', path: 'title' });
    }

    // The server reads a blank id as absent, so a pair check there would not match this one.
    for (const field of storeIdFields) {
        if (input[field]?.trim() === '') {
            issues.push({ message: 'must not be empty', path: field });
        }
    }

    if (input.priceUsd !== undefined && !(Number.isFinite(input.priceUsd) && input.priceUsd >= 0)) {
        issues.push({ message: 'must be a number of 0 or more', path: 'priceUsd' });
    }

    if (input.androidBasePlanId !== undefined && input.androidProductId === undefined) {
        issues.push({ fields: ['androidProductId'], message: 'needs {androidProductId}', path: 'androidBasePlanId' });
    }

    if (input.androidProductId !== undefined && input.androidBasePlanId === undefined && input.period !== 'lifetime') {
        issues.push({
            fields: ['androidProductId'],
            message: 'required with {androidProductId} for a subscription',
            path: 'androidBasePlanId',
        });
    }

    return [
        ...issues,
        ...pairIssues(input, 'stripeProductId', 'stripePriceId'),
        ...pairIssues(input, 'paddleProductId', 'paddlePriceId'),
    ];
};

type CreateProductRequest = {
    access_level_id: string;
    android_base_plan_id?: string;
    android_product_id?: string;
    ios_product_id?: string;
    paddle_price_id?: string;
    paddle_product_id?: string;
    period: ProductPeriod;
    price_usd?: number;
    stripe_price_id?: string;
    stripe_product_id?: string;
    title: string;
};

export const toCreateRequest = (input: CreateProductInput): CreateProductRequest => ({
    access_level_id: input.accessLevelId,
    period: input.period,
    title: input.title,
    ...(input.priceUsd === undefined ? {} : { price_usd: input.priceUsd }),
    ...(input.iosProductId === undefined ? {} : { ios_product_id: input.iosProductId }),
    ...(input.androidProductId === undefined ? {} : { android_product_id: input.androidProductId }),
    ...(input.androidBasePlanId === undefined ? {} : { android_base_plan_id: input.androidBasePlanId }),
    ...(input.stripeProductId === undefined ? {} : { stripe_product_id: input.stripeProductId }),
    ...(input.stripePriceId === undefined ? {} : { stripe_price_id: input.stripePriceId }),
    ...(input.paddleProductId === undefined ? {} : { paddle_product_id: input.paddleProductId }),
    ...(input.paddlePriceId === undefined ? {} : { paddle_price_id: input.paddlePriceId }),
});
