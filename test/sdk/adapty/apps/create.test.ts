import { expect } from 'chai';

import { validateCreateApp } from '../../../../src/sdk/adapty/apps/index.js';

import type { CreateAppInput } from '../../../../src/sdk/adapty/index.js';
import type { Issue } from '../../../../src/sdk/core/errors.js';

/** A rule returns a list instead of throwing, which is what makes a table like this possible. */
const paths = (issues: readonly Issue[]): (string | undefined)[] => issues.map(issue => issue.path);

describe('validateCreateApp', () => {
    const cases: { expected: string[]; input: CreateAppInput; name: string }[] = [
        { expected: [], input: { appleBundleId: 'com.a', platforms: ['ios'], title: 'A' }, name: 'ios with an apple bundle id' },
        { expected: ['appleBundleId'], input: { platforms: ['ios'], title: 'A' }, name: 'ios without one' },
        { expected: ['appleBundleId'], input: { appleBundleId: '', platforms: ['ios'], title: 'A' }, name: 'ios with an empty one' },
        { expected: ['googleBundleId'], input: { platforms: ['android'], title: 'A' }, name: 'android without a google bundle id' },
        { expected: ['appleBundleId', 'googleBundleId'], input: { platforms: ['ios', 'android'], title: 'A' }, name: 'both platforms: both problems at once' },
        { expected: ['title'], input: { googleBundleId: 'com.a', platforms: ['android'], title: '  ' }, name: 'a title of spaces' },
        { expected: ['platform'], input: { platforms: [], title: 'A' }, name: 'no platform at all' },
    ];

    for (const { expected, input, name } of cases) {
        it(name, () => {
            expect(paths(validateCreateApp(input))).to.deep.equal(expected);
        });
    }
});
