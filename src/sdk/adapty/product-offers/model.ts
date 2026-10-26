/**
 * What every operation of the resource shares: the offer as the server sends it, and the type
 * vocabulary. Answers pass through exactly as they arrive, in snake_case, which is what --json prints.
 */

import type { Issue } from '../../core/errors.js';

/** The types a write accepts, as the server names them. */
export const offerTypes = ['promotional', 'win_back'] as const;
export type OfferType = (typeof offerTypes)[number];

export type StoreOffer = {
    offer_id: string;
};

export type ProductOffer = {
    /** Null when the offer has no fixed duration. */
    duration: null | string;
    id: string;
    /** Not the OfferType union: the server also answers `introductory`, which a write refuses. */
    offer_type: string;
    product_id: string;
    /** Keyed as the server stored it: `app_store`, `play_store`, and any other key it may hold. */
    store_offers: Record<string, StoreOffer>;
    title: string;
};

/** The fields of a write. */
export type OfferWrite = {
    androidOfferId?: string | undefined;
    iosOfferId?: string | undefined;
    offerType: OfferType;
    title: string;
};

/** An update merged onto the stored offer, before the rules have checked its type. */
export type OfferDraft = Omit<OfferWrite, 'offerType'> & { offerType: string };

export const isOfferType = (value: string): value is OfferType => (offerTypes as readonly string[]).includes(value);

/** Trimmed, and a blank id is not an id: `--ios-offer-id ""` counts as absent. */
export const storeId = (value: string | undefined): string | undefined => {
    const trimmed = value?.trim();

    return trimmed === '' ? undefined : trimmed;
};

export const hasStoreId = (write: OfferDraft): boolean =>
    storeId(write.iosOfferId) !== undefined || storeId(write.androidOfferId) !== undefined;

/** Google Play has no win-back offers: the server refuses a win_back with an android id. */
export const winBackIssues = (write: OfferDraft): Issue[] =>
    (write.offerType === 'win_back' && storeId(write.androidOfferId) !== undefined
        ? [{ message: 'a win_back offer takes only an App Store offer id', path: 'androidOfferId' }]
        : []);

type OfferWriteRequest = {
    android_offer_id?: string;
    ios_offer_id?: string;
    offer_type: string;
    title: string;
};

/** The body of create and update alike: the server replaces the whole offer. Blank ids are left out. */
export const toWriteRequest = (write: OfferDraft): OfferWriteRequest => {
    const body: OfferWriteRequest = { offer_type: write.offerType, title: write.title };
    const ios = storeId(write.iosOfferId);
    const android = storeId(write.androidOfferId);

    if (ios !== undefined) {
        body.ios_offer_id = ios;
    }

    if (android !== undefined) {
        body.android_offer_id = android;
    }

    return body;
};
