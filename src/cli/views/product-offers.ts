import { renderPage } from './list.js';
import { renderRecord } from './record.js';

import type { Paginated, ProductOffer } from '../../sdk/adapty/index.js';

/**
 * The offer with the plan of its App Store side as a label, `Plan: Monthly` or `Plan: Upfront`, in place of the
 * server's `billing_plan_type`. A side without the key (a server that does not know the plan) gets no label.
 */
const labelled = (offer: ProductOffer): object => {
    const appStore = offer.store_offers.app_store;

    if (appStore === undefined || !('billing_plan_type' in appStore)) {
        return offer;
    }

    const { billing_plan_type: plan, ...side } = appStore;

    return {
        ...offer,
        store_offers: { ...offer.store_offers, app_store: { ...side, plan: plan === 'monthly' ? 'Monthly' : 'Upfront' } },
    };
};

export const renderOffer = (offer: ProductOffer): string => renderRecord(labelled(offer));

export const renderOfferPage = (page: Paginated<ProductOffer>): string =>
    renderPage({ ...page, data: page.data.map(offer => labelled(offer)) });
