import { expect } from 'chai';

import { parseChoice } from '../../../../../src/cli/commands/skills/install/lib/choose.js';

describe('skills install: parseChoice', () => {
    it('picks every agent on an empty answer', () => {
        expect(parseChoice('  ', 3)).to.deep.equal([0, 1, 2]);
    });

    it('picks the numbered agents in list order, whatever separates them, once each', () => {
        expect(parseChoice('3, 1 3', 3)).to.deep.equal([0, 2]);
    });

    for (const answer of ['0', '4', 'claude', '1.5', '1,,x']) {
        it(`asks again after "${answer}"`, () => {
            expect(parseChoice(answer, 3)).to.equal(undefined);
        });
    }
});
