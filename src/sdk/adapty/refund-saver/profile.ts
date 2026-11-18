import type { CustomPreference } from './model.js';
import type { Issue } from '../../core/errors.js';

export type UpdateProfileSettingsInput = {
    consent?: boolean | undefined;
    customPreference?: CustomPreference | undefined;
};

type ProfileSettingsRequest = {
    consent?: boolean;
    custom_preference?: CustomPreference;
};

export const validateProfileSettings = (input: UpdateProfileSettingsInput): Issue[] =>
    (input.consent === undefined && input.customPreference === undefined
        ? [{ message: 'nothing to update: pass a custom preference or the consent' }]
        : []);

export const toProfileSettingsRequest = (input: UpdateProfileSettingsInput): ProfileSettingsRequest => {
    const body: ProfileSettingsRequest = {};

    if (input.customPreference !== undefined) {
        body.custom_preference = input.customPreference;
    }

    if (input.consent !== undefined) {
        body.consent = input.consent;
    }

    return body;
};
