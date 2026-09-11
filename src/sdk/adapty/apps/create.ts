import type { Platform } from './model.js';
import type { Issue } from '../../core/errors.js';

export type CreateAppInput = {
    appleBundleId?: string | undefined;
    googleBundleId?: string | undefined;
    platforms: readonly Platform[];
    title: string;
};

type CreateAppRequest = {
    apple_bundle_id?: string;
    google_bundle_id?: string;
    platforms: Platform[];
    title: string;
};

/**
 * The business rules of creating an app: a pure function returning a list of problems, knowing
 * nothing about flags or the network. An Issue path names an input field (camelCase) and the
 * adapter turns it into the flag the user typed (src/cli/errors.ts).
 *
 * A list instead of a throw, so a table test walks the rules without an environment and the user
 * sees every problem at once.
 */
export const validateCreateApp = (input: CreateAppInput): Issue[] => {
    const issues: Issue[] = [];

    if (input.title.trim() === '') {
        issues.push({ message: 'must not be empty', path: 'title' });
    }

    if (input.platforms.length === 0) {
        issues.push({ message: 'at least one platform is required', path: 'platform' });
    }

    // An empty string counts as missing: `--apple-bundle-id ""` is not a bundle id
    if (input.platforms.includes('ios') && (input.appleBundleId ?? '') === '') {
        issues.push({ message: 'required when platforms include ios', path: 'appleBundleId' });
    }

    if (input.platforms.includes('android') && (input.googleBundleId ?? '') === '') {
        issues.push({ message: 'required when platforms include android', path: 'googleBundleId' });
    }

    return issues;
};

/** An absent field is left out of the body: the server tells "not given" from "set to empty". */
export const toCreateRequest = (input: CreateAppInput): CreateAppRequest => {
    const body: CreateAppRequest = { platforms: [...input.platforms], title: input.title };

    if (input.appleBundleId !== undefined) {
        body.apple_bundle_id = input.appleBundleId;
    }

    if (input.googleBundleId !== undefined) {
        body.google_bundle_id = input.googleBundleId;
    }

    return body;
};
