import { Args, Flags } from '@oclif/core';

import { stopContent } from '../../sdk/adapty/index.js';
import { usageError } from '../errors.js';

import { uuidParser } from './uuid.js';

import type { AbTestType, FlowArm, PaywallArm, StopAbTestInput } from '../../sdk/adapty/index.js';

const TEST_ID_HINT = 'Invalid A/B test ID format. Run `adapty ab-tests list --app <app>` to find the test ID.';

/** A flag value that is an id: the hint names the command that lists the ids, as `appIdFlag` does. */
const idParser = (what: string, whereToLook: string) => uuidParser(`Invalid ${what} ID format. ${whereToLook}`);

const placementParser = idParser('placement', 'Run `adapty placements list --app <app>` to find it.');
const segmentParser = idParser('segment', 'Run `adapty segments list --app <app>` to find it.');
const contentParser = idParser('content', 'Run `adapty paywalls list --app <app>` or `adapty flows list --app <app>` to find it.');

export const abTestIdArg = {
    ab_test_id: Args.string({
        description: 'A/B test ID (UUID)',
        parse: uuidParser(TEST_ID_HINT),
        required: true,
    }),
};

const ARM_USAGE = 'Arms are a JSON array: [{"paywall_id": "<id>", "weight": 50, "title": "A"}, ...] '
    + '(--flows: the same with "flow_id"). "title" is optional.';

/**
 * The shape of one arm, as the flag takes it. Only the shape: the weights, the number of arms and
 * the content are the backend's rules and reach the user with its text.
 */
const parseArms = <Arm extends FlowArm | PaywallArm>(raw: string, idKey: 'flow_id' | 'paywall_id'): Arm[] => {
    let parsed: unknown;

    try {
        parsed = JSON.parse(raw);
    } catch {
        throw usageError(`The arms are not valid JSON. ${ARM_USAGE}`);
    }

    if (!Array.isArray(parsed)) {
        throw usageError(`The arms must be a JSON array. ${ARM_USAGE}`);
    }

    return parsed.map((item: unknown, index): Arm => {
        const arm = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
        const id = arm[idKey];
        const { title, weight } = arm;

        if (typeof id !== 'string' || typeof weight !== 'number' || !Number.isInteger(weight)) {
            throw usageError(`Arm ${String(index + 1)} needs "${idKey}" (a string) and "weight" (an integer). ${ARM_USAGE}`);
        }

        if (title !== undefined && title !== null && typeof title !== 'string') {
            throw usageError(`Arm ${String(index + 1)}: "title" must be a string. ${ARM_USAGE}`);
        }

        // Named keys only: whatever else the JSON carries never reaches the server
        return (title === undefined ? { [idKey]: id, weight } : { [idKey]: id, title, weight }) as Arm;
    });
};

/** Spread into create, update and replace: `static flags = { ...abTestWriteFlags }`. */
export const abTestWriteFlags = {
    flows: Flags.custom<FlowArm[]>({
        description: 'Arms of a flow test as JSON: [{"flow_id": "<id>", "weight": 50, "title": "A"}, ...]',
        exactlyOne: ['paywalls', 'flows'],
        parse: input => Promise.resolve(parseArms<FlowArm>(input, 'flow_id')),
    })(),
    goal: Flags.string({ default: '', description: 'What the test is meant to show' }),
    paywalls: Flags.custom<PaywallArm[]>({
        description: 'Arms of a paywall test as JSON: [{"paywall_id": "<id>", "weight": 50, "title": "A"}, ...]',
        exactlyOne: ['paywalls', 'flows'],
        parse: input => Promise.resolve(parseArms<PaywallArm>(input, 'paywall_id')),
    })(),
    title: Flags.string({ description: 'Test title', required: true }),
};

export const requiredPlacementFlag = (description: string) => ({
    placement: Flags.string({ description, parse: placementParser, required: true }),
});

/** The filters of a list: each one may repeat, and the tests of any of the given ids match. */
export const listFilterFlags = {
    placement: Flags.string({
        description: 'Only the tests of this placement (ID); repeat it for several placements',
        multiple: true,
        parse: placementParser,
    }),
    segment: Flags.string({
        description: 'Only the tests that run for exactly this segment (ID); repeat it for several segments',
        multiple: true,
        parse: segmentParser,
    }),
};

/** At most one of the two: none is no planned audience. `note` is added to both descriptions. */
export const plannedAudienceFlags = (note?: string) => {
    const suffix = note === undefined ? '' : `. ${note}`;

    return {
        'all-users': Flags.boolean({
            description: `Plan the test for All users${suffix}`,
            exclusive: ['segment'],
        }),
        'segment': Flags.string({
            description: `Plan the test for one segment (ID)${suffix}`,
            exclusive: ['all-users'],
            parse: segmentParser,
        }),
    };
};

/** Exactly one of the two: the audience of a start is chosen on purpose. */
export const runningAudienceFlags = {
    'all-users': Flags.boolean({
        description: 'Run the test for All users',
        exactlyOne: ['segment', 'all-users'],
    }),
    'segment': Flags.string({
        description: 'Run the test for one segment (ID)',
        exactlyOne: ['segment', 'all-users'],
        parse: segmentParser,
    }),
};

/** `--segment X` is `["X"]`, `--all-users` is `[]`, none is not sent. */
export const segmentIds = (flags: { 'all-users'?: boolean | undefined; 'segment'?: string | undefined }): string[] | undefined => {
    if (flags.segment !== undefined) {
        return [flags.segment];
    }

    return flags['all-users'] === true ? [] : undefined;
};

/** The audience of a start: `--segment X` is `["X"]`; `exactlyOne` makes anything else `--all-users`, which is `[]`. */
export const runningSegmentIds = (flags: { segment?: string | undefined }): string[] =>
    (flags.segment === undefined ? [] : [flags.segment]);

/** Exactly one: the content that the audience shows after the stop, or nothing. */
export const stopFlags = {
    'no-content': Flags.boolean({
        description: 'Show nothing: the audience is removed from the placement (refused on All users)',
        exactlyOne: ['winner', 'other', 'no-content'],
    }),
    'other': Flags.string({
        description: 'Show other content (a paywall of a paywall test, a flow of a flow test) instead',
        exactlyOne: ['winner', 'other', 'no-content'],
        parse: contentParser,
    }),
    'winner': Flags.string({
        description: 'Show the content of this arm (paywall or flow ID) to the whole audience',
        exactlyOne: ['winner', 'other', 'no-content'],
        parse: contentParser,
    }),
};

/** The server names the content kind in the field: the type of the test decides which one is sent. */
export const stopInput = (
    type: AbTestType,
    flags: { 'no-content'?: boolean | undefined; 'other'?: string | undefined; 'winner'?: string | undefined },
): StopAbTestInput => {
    if (flags.winner !== undefined) {
        return stopContent(type, { id: flags.winner, kind: 'winner' });
    }

    if (flags.other !== undefined) {
        return stopContent(type, { id: flags.other, kind: 'other' });
    }

    return {};
};
