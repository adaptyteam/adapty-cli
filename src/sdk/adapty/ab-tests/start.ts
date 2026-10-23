import type { Issue } from '../../core/errors.js';

export type StartAbTestInput = {
    placementId: string;
    /** `[]` is "All users", `[id]` one segment. No default: the caller picks the audience on purpose. */
    segmentIds: readonly string[];
};

type StartRequest = {
    placement_id: string;
    segment_ids: string[];
};

export const validateStart = (input: StartAbTestInput): Issue[] => {
    const issues: Issue[] = [];

    if (input.placementId === '') {
        issues.push({ message: 'is required', path: 'placementId' });
    }

    if (input.segmentIds.length > 1) {
        issues.push({ message: 'a test runs on one audience: pass one segment id, or none for All users', path: 'segmentIds' });
    }

    return issues;
};

export const toStartRequest = (input: StartAbTestInput): StartRequest =>
    ({ placement_id: input.placementId, segment_ids: [...input.segmentIds] });
