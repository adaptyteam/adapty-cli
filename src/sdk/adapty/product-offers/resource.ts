import { pollUntil } from '../../core/poll.js';
import { assertValid } from '../../core/validation.js';

import { validateCreateProductOffer } from './create.js';
import { toWriteRequest } from './model.js';
import { unfinishedRegions, validatePushOffer } from './push.js';
import { mergeProductOffer, validateMergedProductOffer, validateUpdateProductOffer } from './update.js';

import type { CreateProductOfferInput } from './create.js';
import type { ProductOffer } from './model.js';
import type { OfferPushPreview, OfferPushResult, PushOfferInput } from './push.js';
import type { UpdateProductOfferInput } from './update.js';
import type { Clock } from '../../core/clock.js';
import type { Http } from '../../core/http/index.js';
import type { WaitOptions } from '../../core/poll.js';
import type { Paginated } from '../pagination.js';

/**
 * The pause before a repeat of an unfinished push. Short on purpose: the unfinished answer has already spent the
 * server's whole deadline, so the pause only keeps an answer that comes back at once from turning into a tight loop.
 */
const REPEAT_PAUSE_MS = 1000;

/**
 * Offers are listed and created under a product and read and changed by their own id under the app:
 * the two path shapes the server routes. There is no delete: offers are deleted in the dashboard only.
 *
 * The validating methods are async on purpose: a broken rule arrives as a rejected promise, like a
 * network failure.
 */
export const productOffers = (http: Http, clock: Clock) => {
    const pushPath = (appId: string, productId: string, input: PushOfferInput): string =>
        `/apps/${appId}/products/${productId}/offers/push/${input.store}`;

    /**
     * Writes to the real store account, so the transport never repeats it on its own: a 5xx or a lost
     * answer may still have created regions. Repeating is the caller's decision, and the push is
     * idempotent (existing regions are skipped, the Adapty offer is reused), so a repeat is safe.
     */
    const push = async (appId: string, productId: string, input: PushOfferInput): Promise<OfferPushResult> => {
        assertValid(validatePushOffer(input));

        return http.post<OfferPushResult>(pushPath(appId, productId, input), input.body);
    };

    return {
        get: (appId: string, offerId: string) => http.get<ProductOffer>(`/apps/${appId}/offers/${offerId}`),

        /** The server answers every offer of the product on one page. */
        list: (appId: string, productId: string) =>
            http.get<Paginated<ProductOffer>>(`/apps/${appId}/products/${productId}/offers`),

        create: async (appId: string, productId: string, input: CreateProductOfferInput): Promise<ProductOffer> => {
            assertValid(validateCreateProductOffer(input));

            return http.post<ProductOffer>(`/apps/${appId}/products/${productId}/offers`, toWriteRequest(input));
        },

        /** A full replace on the server, so this reads the stored offer and sends it back merged. */
        update: async (appId: string, offerId: string, input: UpdateProductOfferInput): Promise<ProductOffer> => {
            assertValid(validateUpdateProductOffer(input));

            const stored = await http.get<ProductOffer>(`/apps/${appId}/offers/${offerId}`);
            const merged = mergeProductOffer(stored, input);

            assertValid(validateMergedProductOffer(stored, input, merged));

            return http.put<ProductOffer>(`/apps/${appId}/offers/${offerId}`, toWriteRequest(merged));
        },

        /**
         * What the push would do, region by region, writing nothing. A push the server would refuse is still
         * a 200, with `errors`. It writes nothing, so the transport may repeat it after a 5xx or a lost answer.
         */
        previewPush: async (appId: string, productId: string, input: PushOfferInput): Promise<OfferPushPreview> => {
            assertValid(validatePushOffer(input));

            return http.post<OfferPushPreview>(`${pushPath(appId, productId, input)}/preview`, input.body, { idempotent: true });
        },

        push,

        /**
         * Push, then push again while a region failed with `deadline_exceeded`, until none is left or the
         * budget runs out. Return the last answer, also when the budget ran out; `onPoll` sees every earlier one.
         */
        pushUntilDone: async (
            appId: string,
            productId: string,
            input: PushOfferInput,
            options: WaitOptions<OfferPushResult> = {},
        ): Promise<OfferPushResult> => {
            assertValid(validatePushOffer(input));

            return pollUntil(
                {
                    clock,
                    done: result => unfinishedRegions(result).length === 0,
                    intervalMs: REPEAT_PAUSE_MS,
                    read: () => push(appId, productId, input),
                },
                options,
            );
        },
    };
};

export type ProductOffersApi = ReturnType<typeof productOffers>;
