import { table } from '../../../../views/table.js';

import type { OfferPushIssue, OfferPushPreview, OfferPushStoreResult, PushOfferInput } from '../../../../../sdk/adapty/index.js';

const NO_VALUE = '—';

const show = (value: null | string): string => value ?? NO_VALUE;

const regionOf = (issue: OfferPushIssue): string => issue.region_code ?? 'all regions';

/** One line per problem: the region (or the whole push), the code and the server's words. */
export const renderIssues = (issues: readonly OfferPushIssue[]): string =>
    issues.map(issue => `${regionOf(issue)} ${issue.error_code}: ${issue.message}`).join('\n');

/**
 * What a region without a price pays: a free offer is free, a Google Play discount is a share of the base price.
 * Both used to print as "—", so a 50% discount read as a free one.
 */
export const pricelessLabel = (body: PushOfferInput['body']): string => {
    if (body.payment_mode === 'free_trial') {
        return 'free';
    }

    // A --file body is any JSON the server validates, so its fields are read with care.
    const google: unknown = body.google;
    const percent = typeof google === 'object' && google !== null ? (google as { discount_percent?: unknown }).discount_percent : undefined;

    return typeof percent === 'number' ? `-${percent}%` : NO_VALUE;
};

/** The offer the push would make, region by region, then what stops it and what to know. */
export const renderPushPreview = (preview: OfferPushPreview, priceless: string = NO_VALUE): string => {
    const lines = [`Store offer ID: ${preview.store_offer_id}`];

    if (preview.regions.length > 0) {
        const rows = preview.regions.map(region => [
            region.region_code,
            show(region.currency),
            region.price ?? priceless,
            show(region.subscription_price),
            region.exists ? 'yes' : 'no',
        ]);

        lines.push(table([['Region', 'Currency', 'Offer price', 'Subscription price', 'Exists'], ...rows]));
    }

    if (preview.errors.length > 0) {
        lines.push('', 'Errors:', renderIssues(preview.errors));
    }

    if (preview.warnings.length > 0) {
        lines.push('', 'Warnings:', ...preview.warnings);
    }

    return lines.join('\n');
};

/** What every push of one run did together: a repeat skips the regions the push before it created. */
export type PushTotals = {
    attempts: number;
    created: number;
    failed: number;
    skipped: number;
};

/** The totals of the run, then the failures of the last push. */
export const renderPushSummary = (result: OfferPushStoreResult, totals: PushTotals): string => {
    const tries = totals.attempts === 1 ? '' : ` (${totals.attempts} pushes)`;

    const lines = [
        `Store offer ${result.store_offer_id}: created ${totals.created}, skipped ${totals.skipped}, failed ${totals.failed}${tries}.`,
    ];

    if (result.failures.length > 0) {
        lines.push('Failures:', renderIssues(result.failures));
    }

    return lines.join('\n');
};
