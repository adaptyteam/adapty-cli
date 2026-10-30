import { pollUntil } from '../../core/poll.js';
import { assertValid } from '../../core/validation.js';

import { isPending, storePricesOfSave } from './model.js';
import { toPreviewRequest, toSaveRequest, validatePreviewPrices } from './set.js';

import type { PricePreview, PriceRow, PriceWriteRow, SavedPrices, StorePrice } from './model.js';
import type { PreviewPricesInput, SavePricesInput } from './set.js';
import type { Clock } from '../../core/clock.js';
import type { Http } from '../../core/http/index.js';
import type { WaitOptions } from '../../core/poll.js';
import type { Paginated } from '../pagination.js';

/** The store task runs about a minute after the save: a faster poll only adds requests. */
const POLL_MS = 10_000;

/** The prices of a product by country, as the dashboard CSV has them. */
export const productPrices = (http: Http, clock: Clock) => {
    const path = (appId: string, productId: string): string => `/apps/${appId}/products/${productId}/prices`;

    /** The server answers every country on one page. */
    const list = (appId: string, productId: string) => http.get<Paginated<PriceRow>>(path(appId, productId));

    return {
        list,

        /** Nothing is saved. The rows that come back carry the rounded prices, which a save takes. */
        preview: async (appId: string, productId: string, input: PreviewPricesInput): Promise<PricePreview> => {
            assertValid(validatePreviewPrices(input));

            return http.post<PricePreview>(`${path(appId, productId)}/preview`, toPreviewRequest(input));
        },

        /** Every row becomes `pending`, also an unchanged one; the store task syncs it about a minute later. */
        save: (appId: string, productId: string, input: SavePricesInput) =>
            http.post<SavedPrices>(path(appId, productId), toSaveRequest(input)),

        /**
         * Poll until no store of the saved rows is `pending`. Return the last read when the budget runs
         * out, which is not an error: the caller reads the statuses.
         */
        waitFor: async (
            appId: string,
            productId: string,
            saved: readonly PriceWriteRow[],
            options: WaitOptions<readonly StorePrice[]> = {},
        ): Promise<StorePrice[]> =>
            pollUntil(
                {
                    clock,
                    done: prices => !prices.some(price => isPending(price)),
                    intervalMs: POLL_MS,
                    read: async () => storePricesOfSave(saved, (await list(appId, productId)).data),
                },
                options,
            ),
    };
};

export type ProductPricesApi = ReturnType<typeof productPrices>;
