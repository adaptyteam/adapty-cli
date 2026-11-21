import { isSdkError } from '../../sdk/core/errors.js';
import { CliError, exitCode } from '../errors.js';

import type { MonthlyPlanRefusal } from '../../sdk/adapty/index.js';

/** What every text about the plan says: help, the question and the refusal without --yes. */
export const NO_REMOVAL = 'A monthly plan cannot be removed from Adapty; only turning monthly payments off in App Store '
    + 'Connect stops it.';

export const PLAN_NOTES = 'The monthly plan is not available in the United States and Singapore, and needs iOS 26.4 or '
    + 'later. Set the plan up in App Store Connect too: Adapty does not create it there yet.';

/** Said to the agent that runs the command when nobody can answer the question. */
export const ASK_FOR_YES = 'Show this to the user and re-run with --yes only after the user says yes.';

/** The server's own words for each reason, so the price list and a refused write read the same. */
const refusals: Record<MonthlyPlanRefusal, { field: string; text: string }> = {
    monthly_plan_has_no_price_points: {
        field: 'price_usd',
        text: 'No App Store monthly price points are available for this annual price.',
    },
    monthly_plan_requires_annual_product: {
        field: 'product_set',
        text: 'Only an annual product can be billed monthly with a 12-month commitment.',
    },
    monthly_plan_requires_app_store_product: {
        field: 'non_field_errors',
        text: 'Add the App Store product first: the monthly plan is billed on it.',
    },
    monthly_plan_requires_product_price: {
        field: 'price_usd',
        text: 'Set the annual price of the product first: the monthly price is checked against it.',
    },
};

/** A product that cannot have a plan: exit 4 with the code and the text that a plan write would get. */
export const refusalError = (refusal: MonthlyPlanRefusal): CliError => {
    const { field, text } = refusals[refusal];

    return new CliError(`${text} (${refusal})`, exitCode.api, refusal, {
        json: { error_code: refusal, errors: { [field]: [text] } },
    });
};

const NOT_SUPPORTED = 'monthly_plan_not_supported';

export const notSupportedError = (cause?: unknown): CliError => new CliError(
    'This server does not support the App Store monthly plan yet. Nothing was changed.',
    exitCode.api,
    NOT_SUPPORTED,
    { cause, json: { error_code: NOT_SUPPORTED } },
);

/**
 * A 404 from a monthly plan route: a server without the plan has no such route. A product that is gone has its
 * own code and keeps it.
 */
export const withNotSupported = (error: unknown): unknown =>
    (isSdkError(error) && error.kind === 'api' && error.status === 404 && error.code !== 'adapty_product_does_not_exist'
        ? notSupportedError(error)
        : error);

/** The answer to a write was lost: no response, or a 5xx. */
export const isLostAnswer = (error: unknown): boolean =>
    isSdkError(error) && (error.kind === 'network' || (error.kind === 'api' && error.status >= 500));
