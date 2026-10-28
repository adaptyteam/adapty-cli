import { audienceText } from './record.js';

import type { AbTestDetail } from '../../../sdk/adapty/index.js';

/**
 * What an action does to real users, in words. One read of the test gives the title;
 * a placement and a segment are shown by id. Four actions cannot be undone — start, stop, replace,
 * archive — and each one says so before the question is asked.
 */

type Titled = Pick<AbTestDetail, 'title'>;

export const startEffect = (
    test: Titled,
    target: { placementId: string; segmentIds: readonly string[] },
): string =>
    `Start A/B test "${test.title}" on placement ${target.placementId} for ${audienceText(target.segmentIds)}. `
    + 'Users of this audience stop seeing what the audience shows now; a test that runs there stops and becomes completed. '
    + 'A new segment audience goes to the top: users of this segment who now get another audience move into the test. '
    + 'A change on a segment audience can take up to 20 minutes to reach users. You cannot undo a start.';

/** `content` is the id that the audience shows afterwards; none removes the audience from the placement. */
export const stopEffect = (test: Titled, content: string | undefined): string => {
    const outcome = content === undefined
        ? 'The audience is removed from the placement; its users get the next matching audience.'
        : `All users of its audience see ${content} from now on.`;

    return `Stop A/B test "${test.title}". ${outcome} The test becomes completed. You cannot start it again as the same test.`;
};

/** What a stop reports when it is done: the same facts, in the past tense. */
export const stoppedLine = (test: Titled, content: string | undefined): string => {
    const outcome = content === undefined
        ? 'the audience is removed from the placement'
        : `all users of its audience see ${content} from now on`;

    return `Stopped A/B test "${test.title}": ${outcome}.`;
};

export const replaceEffect = (test: Titled): string =>
    `Replace A/B test "${test.title}" with a new test. "${test.title}" stops and becomes completed; `
    + 'its results stay on its id. A new test with a new id starts on the same audience, '
    + 'and every user of the audience gets a new draw. If you give another placement, the audience leaves '
    + 'the old placement and the new test starts in the new one (refused on All users). '
    + 'In the dashboard this is "Modify".';

export const replacedLine = (previousId: string, replacement: Pick<AbTestDetail, 'ab_test_id'>): string =>
    `New test ${replacement.ab_test_id} replaces ${previousId} (now completed).`;

/** The text of the dashboard dialog. */
export const archiveEffect = (test: Titled): string =>
    `Archive A/B test "${test.title}"? Once archived, A/B test cannot be unarchived.`;

export const archivedLine = (test: Titled): string => `Archived A/B test "${test.title}".`;
