import type { ProductStore } from './model.js';
import type { Issue } from '../../core/errors.js';

export type PushProductInput = {
    /** App Store: turn Family Sharing on. Off when not given; Apple does not let it be turned off later. */
    familySharable?: boolean | undefined;
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

    if (input.store === 'play_store' && input.familySharable !== undefined) {
        issues.push({ message: 'is an App Store field: it does not go with Google Play', path: 'familySharable' });
    }

    return issues;
};

type PushProductRequest = {
    base_plan_id?: string;
    family_sharable?: boolean;
    group_id?: string;
    screenshot?: string;
    store_product_id: string;
};

/** An App Store push always says whether Family Sharing is on, so the server default never decides it. */
export const toPushRequest = (input: PushProductInput): PushProductRequest => ({
    store_product_id: input.storeProductId,
    ...(input.store === 'app_store' ? { family_sharable: input.familySharable === true } : {}),
    ...(input.groupId === undefined ? {} : { group_id: input.groupId }),
    ...(input.androidBasePlanId === undefined ? {} : { base_plan_id: input.androidBasePlanId }),
    ...(input.screenshot === undefined ? {} : { screenshot: input.screenshot }),
});
