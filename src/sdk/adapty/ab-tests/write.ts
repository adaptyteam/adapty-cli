import type { Issue } from '../../core/errors.js';

/** An arm as the server takes it. `title` is optional: with none, the SDK reports the content name. */
export type PaywallArm = {
    paywall_id: string;
    title?: null | string | undefined;
    weight: number;
};

export type FlowArm = {
    flow_id: string;
    title?: null | string | undefined;
    weight: number;
};

/** What create, update and replace take; replace sets no audience and requires a placement. */
export type AbTestWriteInput = {
    flows?: readonly FlowArm[] | undefined;
    goal?: string | undefined;
    paywalls?: readonly PaywallArm[] | undefined;
    placementId?: string | undefined;
    /**
     * `[]` is "All users", `[id]` one segment, and absent is no planned audience. At most one id:
     * a test runs on one audience.
     */
    segmentIds?: readonly string[] | undefined;
    title: string;
};

type WriteRequest = {
    flows?: FlowArm[];
    goal?: string;
    paywalls?: PaywallArm[];
    placement_id?: string;
    segment_ids?: string[];
    title: string;
};

/**
 * Only the shape of the input: what a call needs to make sense. The content rules (weights that
 * sum to 100, the number of arms, a published flow, the kind of the placement) stay in the
 * backend, and reach the user with its text.
 */
export const validateWrite = (input: AbTestWriteInput, options: { placementRequired?: boolean } = {}): Issue[] => {
    const issues: Issue[] = [];

    if (input.title.trim() === '') {
        issues.push({ message: 'must not be empty', path: 'title' });
    }

    if ((input.paywalls === undefined) === (input.flows === undefined)) {
        issues.push({ message: 'pass exactly one of paywalls or flows', path: input.paywalls === undefined ? 'paywalls' : 'flows' });
    }

    if ((input.segmentIds?.length ?? 0) > 1) {
        issues.push({ message: 'a test runs on one audience: pass one segment id, or none for All users', path: 'segmentIds' });
    }

    if (options.placementRequired === true && (input.placementId ?? '') === '') {
        issues.push({ message: 'is required', path: 'placementId' });
    }

    return issues;
};

/** An absent field is left out of the body: the server tells "not given" from "set to empty". */
export const toWriteRequest = (input: AbTestWriteInput): WriteRequest => {
    const body: WriteRequest = { title: input.title };

    if (input.goal !== undefined) {
        body.goal = input.goal;
    }

    if (input.placementId !== undefined) {
        body.placement_id = input.placementId;
    }

    if (input.segmentIds !== undefined) {
        body.segment_ids = [...input.segmentIds];
    }

    if (input.paywalls !== undefined) {
        body.paywalls = [...input.paywalls];
    }

    if (input.flows !== undefined) {
        body.flows = [...input.flows];
    }

    return body;
};
