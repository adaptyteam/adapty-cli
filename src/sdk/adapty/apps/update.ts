import type { Issue } from '../../core/errors.js';

export type UpdateAppInput = {
    appleBundleId?: string | undefined;
    googleBundleId?: string | undefined;
    title?: string | undefined;
};

type UpdateAppRequest = {
    apple_bundle_id?: string;
    google_bundle_id?: string;
    title?: string;
};

/** Same contract as the create rule: problems as a list, paths naming input fields. */
export const validateUpdateApp = (input: UpdateAppInput): Issue[] => {
    const fields = [input.title, input.appleBundleId, input.googleBundleId];

    if (fields.every(value => value === undefined)) {
        return [{ message: 'nothing to update: pass a title or a bundle id' }];
    }

    if (input.title?.trim() === '') {
        return [{ message: 'must not be empty', path: 'title' }];
    }

    return [];
};

/** An absent field is left out of the body: the server tells "not given" from "set to empty". */
export const toUpdateRequest = (input: UpdateAppInput): UpdateAppRequest => {
    const body: UpdateAppRequest = {};

    if (input.title !== undefined) {
        body.title = input.title;
    }

    if (input.appleBundleId !== undefined) {
        body.apple_bundle_id = input.appleBundleId;
    }

    if (input.googleBundleId !== undefined) {
        body.google_bundle_id = input.googleBundleId;
    }

    return body;
};
