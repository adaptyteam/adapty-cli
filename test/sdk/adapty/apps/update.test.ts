import { expect } from 'chai';

import { validateUpdateApp } from '../../../../src/sdk/adapty/apps/index.js';

import type { UpdateAppInput } from '../../../../src/sdk/adapty/index.js';
import type { Issue } from '../../../../src/sdk/core/errors.js';

/** A rule returns a list instead of throwing, which is what makes a table like this possible. */
const paths = (issues: readonly Issue[]): (string | undefined)[] => issues.map(issue => issue.path);

describe('validateUpdateApp', () => {
    const cases: { expected: (string | undefined)[]; input: UpdateAppInput; name: string }[] = [
        // No path: the input as a whole is the problem, not one of its fields
        { expected: [undefined], input: {}, name: 'nothing given' },
        { expected: [], input: { title: 'B' }, name: 'a title only' },
        { expected: [], input: { googleBundleId: 'com.b' }, name: 'a google bundle id only' },
        { expected: ['title'], input: { title: '' }, name: 'an empty title' },
    ];

    for (const { expected, input, name } of cases) {
        it(name, () => {
            expect(paths(validateUpdateApp(input))).to.deep.equal(expected);
        });
    }
});
