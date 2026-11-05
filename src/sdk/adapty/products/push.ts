import type { ProductStore } from './model.js';
import type { Issue } from '../../core/errors.js';

export type PushProductInput = {
    /** App Store, subscriptions only. */
    groupId?: string | undefined;
    /** Google Play, subscriptions only. */
    androidBasePlanId?: string | undefined;
    /** A data URI of the review screenshot, required by the App Store. */
    screenshot?: string | undefined;
    store: ProductStore;
    storeProductId: string;
};

/**
 * An App Store push needs the review screenshot. A field of the other store is refused: the server would ignore it,
 * and the user would think it was used.
 */
export const validatePushProduct = (input: PushProductInput): Issue[] => {
    const issues: Issue[] = [];

    if (input.storeProductId.trim() === '') {
        issues.push({ message: 'must not be empty', path: 'storeProductId' });
    }

    if (input.store === 'app_store' && input.androidBasePlanId !== undefined) {
        issues.push({ message: 'is a Google Play field: it does not go with the App Store', path: 'androidBasePlanId' });
    }

    if (input.store === 'app_store' && input.screenshot === undefined) {
        issues.push({ message: 'is required for an App Store push', path: 'screenshot' });
    }

    if (input.store === 'play_store' && input.groupId !== undefined) {
        issues.push({ message: 'is an App Store field: it does not go with Google Play', path: 'groupId' });
    }

    if (input.store === 'play_store' && input.screenshot !== undefined) {
        issues.push({ message: 'is an App Store field: it does not go with Google Play', path: 'screenshot' });
    }

    return issues;
};

type PushProductRequest = {
    base_plan_id?: string;
    group_id?: string;
    screenshot?: string;
    store_product_id: string;
};

export const toPushRequest = (input: PushProductInput): PushProductRequest => ({
    store_product_id: input.storeProductId,
    ...(input.groupId === undefined ? {} : { group_id: input.groupId }),
    ...(input.androidBasePlanId === undefined ? {} : { base_plan_id: input.androidBasePlanId }),
    ...(input.screenshot === undefined ? {} : { screenshot: input.screenshot }),
});
