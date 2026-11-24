import type { AppStorePreference, PlayStorePreference } from './model.js';
import type { Issue } from '../../core/errors.js';

export type UpdateRefundSaverInput = {
    appStorePreference?: AppStorePreference | undefined;
    needsConsent?: boolean | undefined;
    playStorePreference?: PlayStorePreference | undefined;
};

type UpdateRequest = {
    stores: {
        app_store?: { preference?: AppStorePreference; refund_saver_needs_consent?: boolean };
        play_store?: { preference: PlayStorePreference };
    };
};

export const validateUpdateRefundSaver = (input: UpdateRefundSaverInput): Issue[] => {
    const fields = [input.appStorePreference, input.needsConsent, input.playStorePreference];

    return fields.every(value => value === undefined)
        ? [{ message: 'nothing to update: pass a store preference or the consent setting' }]
        : [];
};

/** Only the fields that were given: the server leaves the others as they are. */
export const toUpdateRequest = (input: UpdateRefundSaverInput): UpdateRequest => {
    const stores: UpdateRequest['stores'] = {};

    if (input.appStorePreference !== undefined || input.needsConsent !== undefined) {
        stores.app_store = {};

        if (input.appStorePreference !== undefined) {
            stores.app_store.preference = input.appStorePreference;
        }

        if (input.needsConsent !== undefined) {
            stores.app_store.refund_saver_needs_consent = input.needsConsent;
        }
    }

    if (input.playStorePreference !== undefined) {
        stores.play_store = { preference: input.playStorePreference };
    }

    return { stores };
};
