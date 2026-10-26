import { hasStoreId, isOfferType, storeId, winBackIssues } from './model.js';

import type { OfferDraft, OfferType, ProductOffer } from './model.js';
import type { Issue } from '../../core/errors.js';

/** A store id is replaced by a string and removed by null; undefined or blank keeps what is stored. */
export type UpdateProductOfferInput = {
    androidOfferId?: null | string | undefined;
    iosOfferId?: null | string | undefined;
    offerType?: OfferType | undefined;
    title?: string | undefined;
};

const given = (value: null | string | undefined): null | string | undefined =>
    (value === null ? null : storeId(value));

/** Rules that need no stored offer, so they run before the first request. */
export const validateUpdateProductOffer = (input: UpdateProductOfferInput): Issue[] => {
    const fields = [input.title, input.offerType, given(input.iosOfferId), given(input.androidOfferId)];

    if (fields.every(value => value === undefined)) {
        return [{ message: 'nothing to update: pass a title, a type or a store offer id' }];
    }

    if (input.title?.trim() === '') {
        return [{ message: 'must not be empty', path: 'title' }];
    }

    return [];
};

const pick = (value: null | string | undefined, stored: string | undefined): string | undefined =>
    (value === undefined ? stored : (value ?? undefined));

/** The offer after the update: the server replaces the whole offer, so untouched fields come from the stored one. */
export const mergeProductOffer = (offer: ProductOffer, input: UpdateProductOfferInput): OfferDraft => ({
    androidOfferId: pick(given(input.androidOfferId), storeId(offer.store_offers.play_store?.offer_id)),
    iosOfferId: pick(given(input.iosOfferId), storeId(offer.store_offers.app_store?.offer_id)),
    offerType: input.offerType ?? offer.offer_type,
    title: input.title ?? offer.title,
});

/**
 * Rules on the stored offer and the merged one, so they run after the read and before the write. The
 * write carries only `app_store` and `play_store`, so an offer with any other store key is refused
 * rather than losing that side to the replace.
 */
export const validateMergedProductOffer = (
    offer: ProductOffer,
    input: UpdateProductOfferInput,
    merged: OfferDraft,
): Issue[] => {
    if (!isOfferType(offer.offer_type)) {
        return [{ message: `${offer.offer_type} offers are read-only` }];
    }

    const otherKeys = Object.keys(offer.store_offers).filter(key => key !== 'app_store' && key !== 'play_store');

    if (otherKeys.length > 0) {
        return [{ message: `this offer has store sides the update would drop (${otherKeys.join(', ')}): edit it in the dashboard` }];
    }

    if (!hasStoreId(merged)) {
        return [{ message: 'an offer needs at least one store offer id: delete it in the dashboard instead of clearing both' }];
    }

    if (given(input.androidOfferId) === undefined && winBackIssues(merged).length > 0) {
        return [{ message: 'a win_back offer takes only an App Store offer id: clear the stored Google Play one' }];
    }

    return winBackIssues(merged);
};
