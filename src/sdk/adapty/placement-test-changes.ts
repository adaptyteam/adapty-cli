import type { Issue } from '../core/errors.js';

/**
 * The part of a placement audience entry that decides what happens to an A/B test. Narrower than
 * the entry on purpose: paywall and flow entries fit it too, and the rule never reads their ids.
 */
export type AudienceEntry = {
    ab_test_id?: string | undefined;
    ab_test_title?: string | undefined;
    content_type: string;
    segment_ids?: readonly string[] | undefined;
};

/**
 * Crossplacement entries (`cross_ab_test`, `flow_cross_ab_test`) are left out on purpose: the API
 * ignores them on a write and keeps the stored ones.
 */
const isRegularTest = (entry: AudienceEntry): boolean => {
    return (entry.content_type === 'ab_test' || entry.content_type === 'flow_ab_test') && entry.ab_test_id !== undefined;
};

/** The audience is its segment set: the API matches the old and the new audiences by it, not by order. */
const segmentKey = (entry: AudienceEntry): string => [...new Set(entry.segment_ids ?? [])].sort().join(',');

const testKey = (entry: AudienceEntry): string => `${entry.ab_test_id ?? ''}@${segmentKey(entry)}`;

const label = (entry: AudienceEntry): string => {
    const title = entry.ab_test_title;

    return title === undefined || title === '' ? (entry.ab_test_id ?? '') : title;
};

const audienceName = (entry: AudienceEntry): string => {
    const segments = [...new Set(entry.segment_ids ?? [])];

    if (segments.length === 0) {
        return 'All users';
    }

    return `${segments.length === 1 ? 'segment' : 'segments'} ${segments.join(', ')}`;
};

/**
 * What a placement write does to A/B tests, one issue per affected test, or none. `current` is the
 * placement as the API shows it now, `next` the audience list the write will send; a create passes
 * an empty `current`. A write that changes no regular test's id or segment set, such as a change of
 * priority only, stops, starts and moves nothing: the API keeps the test.
 *
 * - a running test that is not in `next` stops with no winner;
 * - a running test that is in `next` on other segments starts again with a new start time;
 * - a test id in `next` that does not run on this placement now starts there. The rule cannot tell
 *   a draft from a completed test or a test of another placement, and all three start.
 */
export const placementTestChanges = (current: readonly AudienceEntry[], next: readonly AudienceEntry[]): Issue[] => {
    const running = current.filter(entry => isRegularTest(entry));
    const proposed = next.filter(entry => isRegularTest(entry));

    const runningByTest = new Map(running.map(entry => [entry.ab_test_id, entry]));
    const keptTests = new Set(running.map(entry => testKey(entry)));
    const proposedTests = new Set(proposed.map(entry => entry.ab_test_id));
    const messages = new Set<string>();

    for (const entry of running) {
        if (!proposedTests.has(entry.ab_test_id)) {
            messages.add(`test ${label(entry)} stops with no winner`);
        }
    }

    for (const entry of proposed) {
        if (keptTests.has(testKey(entry))) {
            continue;
        }

        const before = runningByTest.get(entry.ab_test_id);

        messages.add(before === undefined
            ? `test ${label(entry)} starts on audience ${audienceName(entry)}`
            : `test ${label(before)} starts again with a new start time`);
    }

    return [...messages].map(message => ({ message }));
};
