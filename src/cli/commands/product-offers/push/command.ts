import { Flags } from '@oclif/core';

import {
    googleEligibilities,
    offerPeriods,
    offerPriorities,
    paymentModes,
    plannedRegions,
    priceRoundings,
    productStores,
    pushOfferTypes,
    unfinishedRegions,
} from '../../../../sdk/adapty/index.js';
import { validatePushOffer } from '../../../../sdk/adapty/product-offers/index.js';
import { assertValid } from '../../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../../base/adapty/index.js';
import { CliError, exitCode, usageError } from '../../../errors.js';
import { appIdFlag } from '../../../input/app.js';
import { confirmAction, yesFlag } from '../../../input/confirm.js';
import { isAmount, productFlag } from '../../../input/product.js';
import { uuidParser } from '../../../input/uuid.js';
import { timeoutFlag } from '../../../input/wait.js';

import { afterPush } from './lib/after-push.js';
import { bodyOfFlags, issuesForUser, readBodyFile, upperAscii } from './lib/body.js';
import { pricelessLabel, renderIssues, renderPushPreview, renderPushSummary } from './lib/view.js';

import type { PushTotals } from './lib/view.js';
import type {
    OfferPushPreview,
    OfferPushResult,
    OfferPushStoreResult,
    ProductOffer,
    ProductStore,
    PushOfferInput,
} from '../../../../sdk/adapty/index.js';

/** `pushed: false` says why nothing was written; the push fields are there once a push answered. */
export type PushOfferResult = {
    attempts?: number;
    offer?: null | ProductOffer;
    preview: OfferPushPreview;
    pushed: boolean;
    reason: 'dry_run' | null;
    store_result?: OfferPushStoreResult;
    /** The budget of the repeats ran out while a region was still unfinished. */
    timed_out?: boolean;
    totals?: PushTotals;
};

const regionPrice = Flags.custom<{ amount: string; region_code: string }>({
    multiple: true,
    parse: (input) => {
        const match = /^\s*([a-z]{2})\s*=\s*(\S+)\s*$/i.exec(input);

        return match?.[1] !== undefined && match[2] !== undefined && isAmount(match[2])
            ? Promise.resolve({ amount: match[2], region_code: upperAscii(match[1]) })
            : Promise.reject(usageError(`Expected REGION=AMOUNT, e.g. DE=4.99, got "${input}".`));
    },
});

const amount = Flags.custom({
    parse: (input): Promise<string> => {
        const text = input.trim();

        return isAmount(text) ? Promise.resolve(text) : Promise.reject(usageError(`Expected a number, e.g. 4.99, got "${input}".`));
    },
});

const months = (description: string) => Flags.integer({ description, helpGroup: 'WIN-BACK (APP STORE)', min: 0 });

const rejected = (preview: OfferPushPreview): CliError =>
    new CliError(
        `Nothing was pushed, the preview has errors:\n${renderIssues(preview.errors)}`,
        exitCode.api,
        'offer_push_rejected',
        { json: { errors: preview.errors, error_code: 'offer_push_rejected' } },
    );

/** A push that answered but left regions behind: exit 4, and the JSON says what is already in the store. */
const leftBehind = (last: OfferPushResult, totals: PushTotals, timedOut: boolean): CliError => {
    const failures = last.store_result.failures;
    const unfinished = unfinishedRegions(last).length;
    const code = unfinished > 0 && unfinished === failures.length ? 'offer_push_incomplete' : 'offer_push_failed';
    const failed = Math.max(last.store_result.failed, failures.length) - unfinished;
    const regions = (count: number): string => `${count} ${count === 1 ? 'region' : 'regions'}`;

    const message = [
        failed > 0 ? `The push failed in ${regions(failed)}:\n${renderIssues(failures)}` : undefined,
        unfinished === 0
            ? undefined
            : `${timedOut ? 'The --timeout budget ran out before' : 'The push ended before'} the store finished ${regions(unfinished)}. `
                + 'Run the same command again to finish them: it skips the regions already created.',
    ].filter(part => part !== undefined).join('\n');

    return new CliError(message, exitCode.api, code, {
        json: {
            attempts: totals.attempts,
            error_code: code,
            errors: failures,
            offer: last.offer,
            pushed: true,
            store_result: last.store_result,
            timed_out: timedOut,
        },
    });
};

const effectOf = (
    body: Readonly<Record<string, unknown>>,
    store: ProductStore,
    productId: string,
    preview: OfferPushPreview,
): string => {
    const { create, skip } = plannedRegions(preview);
    const what = [body.offer_type, body.payment_mode, body.period].filter(part => typeof part === 'string').join(', ');
    const title = typeof body.title === 'string' ? `"${body.title}"` : 'the offer';

    return `Pushes offer ${title}${what === '' ? '' : ` (${what})`} of product ${productId} to ${store} `
        + `as "${preview.store_offer_id}": it writes to the REAL store account. `
        + `It creates the offer in ${create} ${create === 1 ? 'region' : 'regions'} and skips ${skip} that already ${skip === 1 ? 'has' : 'have'} it.`;
};

export default class ProductOffersPush extends AdaptyCommand {
    static override description
        = 'Create a subscription offer in the real App Store Connect or Google Play account and link it to an Adapty offer. '
            + 'It always previews first (the price of each region, whether the store already has the offer there) and prints '
            + 'the preview; a preview with errors pushes nothing and exits 4 (`offer_push_rejected`). `--dry-run` stops after '
            + 'the preview. It asks before the push (`--yes` skips the question; exit 6 when nobody can answer). The push '
            + 'is synchronous and idempotent: a region the store already has is skipped and the Adapty offer is reused. An '
            + 'App Store introductory offer is created region by region; regions the store did not finish in time come back '
            + 'as `deadline_exceeded`, and the command pushes again until none is left or --timeout passes (--no-wait pushes once). '
            + 'Exit 4 after a push means some regions are not in the store (`offer_push_incomplete`: run the same command again; '
            + '`offer_push_failed`: read the failures); the error JSON then says `pushed: true`. The body comes from the flags, '
            + 'or whole from --file (JSON, the API body), which takes no body flags.';

    static override examples = [
        '<%= config.bin %> product-offers push --app 550e8400-... --product 660e8400-... --store app_store --title "Free week" --type introductory --mode free_trial --period one_week --dry-run',
        '<%= config.bin %> product-offers push --app 550e8400-... --product 660e8400-... --store play_store --title "Spring" --type promotional --mode pay_as_you_go --period one_month --periods 3 --store-offer-id spring-50 --price 4.99 --region-price DE=3.99 --eligibility acquisition',
        '<%= config.bin %> product-offers push --app 550e8400-... --product 660e8400-... --store app_store --file offer.json',
    ];

    static override flags = {
        ...appIdFlag,
        ...productFlag,
        ...yesFlag,
        'store': Flags.option({ description: 'Store to create the offer in', options: productStores, required: true })(),
        'file': Flags.string({
            combinable: ['app', 'product', 'store', 'yes', 'dry-run', 'json', 'wait', 'timeout'],
            description: 'JSON file with the whole body of the push (snake_case, as the API takes it), passed on as written; no body flag goes with it',
        }),
        'dry-run': Flags.boolean({ description: 'Print the preview and push nothing' }),
        'wait': Flags.boolean({
            allowNo: true,
            default: true,
            description: 'Push again while the store leaves regions unfinished (deadline_exceeded), within --timeout; --no-wait pushes once',
        }),
        'timeout': timeoutFlag,

        'title': Flags.string({ description: 'Offer title (required)' }),
        'type': Flags.option({ description: 'Offer type (required; win_back is App Store only)', options: pushOfferTypes })(),
        'mode': Flags.option({ description: 'Payment mode (required)', options: paymentModes })(),
        'period': Flags.option({ description: 'Length of one offer period (required)', options: offerPeriods })(),
        'periods': Flags.integer({ description: 'Number of periods, 1-12 (default 1; 1 for pay_up_front)' }),
        'store-offer-id': Flags.string({
            description: 'Offer ID in the store: App Store promotional code or win-back offer ID (1-100 of A-Z, a-z, 0-9, _ and .), Google Play offer ID (a-z, 0-9, -); an App Store introductory offer has none',
        }),
        'price': amount({ description: 'Offer price, e.g. 4.99; converted to every region the store sells in' }),
        'currency': Flags.string({ dependsOn: ['price'], description: 'Currency of --price (default USD)' }),
        'round': Flags.option({ dependsOn: ['price'], description: 'How a converted price meets the store price points (default nearest)', options: priceRoundings })(),
        'region-price': regionPrice({ description: 'Price of one region in its own currency, REGION=AMOUNT, e.g. DE=4.99 (repeatable)' }),
        'regions': Flags.string({ delimiter: ',', description: 'Regions to create the offer in, e.g. US,DE (default: all)', multiple: true }),
        'start-date': Flags.string({ description: 'First day of the offer, YYYY-MM-DD' }),
        'end-date': Flags.string({ description: 'Last day of the offer, YYYY-MM-DD' }),
        'priority': Flags.option({ description: 'Offer priority', options: offerPriorities })(),
        'offer': Flags.string({
            description: 'Adapty offer ID to add this store offer to, e.g. the other store of the same offer (`product-offers list`)',
            parse: uuidParser('Invalid offer ID format.'),
        }),

        'paid-subscription-months': months('Months of paid subscription a customer needs'),
        'since-last-subscribed-min-months': months('Fewest months since the last subscription'),
        'since-last-subscribed-max-months': months('Most months since the last subscription'),
        'wait-between-offers-months': months('Months between two win-back offers to one customer'),

        'eligibility': Flags.option({ description: 'Who can get the offer', helpGroup: 'GOOGLE PLAY', options: googleEligibilities })(),
        'offer-tag': Flags.string({ description: 'Offer tag (repeatable)', helpGroup: 'GOOGLE PLAY', multiple: true }),
        'discount-percent': Flags.integer({ description: 'Discount off the base price, 1-99, instead of --price', helpGroup: 'GOOGLE PLAY' }),
    };

    async run(): Promise<PushOfferResult> {
        const { flags } = await this.parse(ProductOffersPush);

        if (!flags.wait && flags.timeout !== undefined) {
            throw usageError('--timeout is the budget of the repeats: it does not go with --no-wait.');
        }

        const fromFile = flags.file !== undefined;

        const flagInput = {
            ...flags,
            regions: flags.regions?.map(code => upperAscii(code.trim())),
        };

        const input: PushOfferInput = {
            body: flags.file === undefined ? bodyOfFlags(flagInput) : readBodyFile(flags.file),
            store: flags.store,
        };

        assertValid(issuesForUser(validatePushOffer(input), fromFile));

        const preview = await this.adapty.productOffers.previewPush(flags.app, flags.product, input);

        this.render(preview, value => renderPushPreview(value, pricelessLabel(input.body)));

        if (preview.errors.length > 0) {
            throw rejected(preview);
        }

        if (flags['dry-run']) {
            this.log('Nothing pushed (--dry-run).');

            return { preview, pushed: false, reason: 'dry_run' };
        }

        await confirmAction({
            effect: effectOf(input.body, flags.store, flags.product, preview),
            interactive: this.interactive,
            signal: this.signal,
            yes: flags.yes,
        });

        return this.#push(flags.app, flags.product, input, { preview, timeoutMs: flags.timeout, wait: flags.wait });
    }

    async #push(
        appId: string,
        productId: string,
        input: PushOfferInput,
        { preview, timeoutMs, wait }: { preview: OfferPushPreview; timeoutMs: number | undefined; wait: boolean },
    ): Promise<PushOfferResult> {
        const answered: OfferPushResult[] = [];

        let last: OfferPushResult;

        try {
            last = wait
                ? await this.adapty.productOffers.pushUntilDone(appId, productId, input, {
                        onPoll: (result) => {
                            answered.push(result);

                            const left = unfinishedRegions(result).length;

                            process.stderr.write(`Created ${result.store_result.created}; the store did not finish `
                                + `${left} ${left === 1 ? 'region' : 'regions'} in time — pushing again…\n`);
                        },
                        signal: this.signal,
                        timeoutMs,
                    })
                : await this.adapty.productOffers.push(appId, productId, input);
        } catch (error) {
            throw afterPush(error, answered);
        }

        answered.push(last);

        // Created = what the store has now less what it had before the first push. A sum of `created` would miss a
        // region whose push got no answer while the store created it: the next push counts it as skipped.
        const skippedAtStart = answered[0]?.store_result.skipped ?? 0;

        const totals: PushTotals = {
            attempts: answered.length,
            created: last.store_result.created + last.store_result.skipped - skippedAtStart,
            failed: last.store_result.failed,
            skipped: skippedAtStart,
        };

        const timedOut = wait && unfinishedRegions(last).length > 0;

        this.log(renderPushSummary(last.store_result, totals));

        if (last.offer !== null) {
            this.log(`Adapty offer: ${last.offer.id}`);
        }

        if (last.store_result.failed > 0 || last.store_result.failures.length > 0) {
            throw leftBehind(last, totals, timedOut);
        }

        return {
            attempts: totals.attempts,
            offer: last.offer,
            preview,
            pushed: true,
            reason: null,
            store_result: last.store_result,
            timed_out: false,
            totals,
        };
    }
}
