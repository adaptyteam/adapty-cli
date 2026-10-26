import { assertValid } from '../../core/validation.js';

import { validateCreateProductOffer } from './create.js';
import { toWriteRequest } from './model.js';
import { mergeProductOffer, validateMergedProductOffer, validateUpdateProductOffer } from './update.js';

import type { CreateProductOfferInput } from './create.js';
import type { ProductOffer } from './model.js';
import type { UpdateProductOfferInput } from './update.js';
import type { Http } from '../../core/http/index.js';
import type { Paginated } from '../pagination.js';

/**
 * Offers are listed and created under a product and read and changed by their own id under the app:
 * the two path shapes the server routes. There is no delete: offers are deleted in the dashboard only.
 *
 * The validating methods are async on purpose: a broken rule arrives as a rejected promise, like a
 * network failure.
 */
export const productOffers = (http: Http) => ({
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
});

export type ProductOffersApi = ReturnType<typeof productOffers>;
