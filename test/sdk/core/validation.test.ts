import { expect } from 'chai';

import { ValidationError } from '../../../src/sdk/core/errors.js';
import { assertValid } from '../../../src/sdk/core/validation.js';

describe('assertValid', () => {
    it('passes an empty list through', () => {
        expect(() => {
            assertValid([]);
        }).to.not.throw();
    });

    it('throws one ValidationError carrying every issue', () => {
        const issues = [
            { message: 'required when platforms include ios', path: 'appleBundleId' },
            { message: 'nothing to update: pass at least one field' },
        ];

        try {
            assertValid(issues);
            expect.fail('expected assertValid to throw');
        } catch (error) {
            expect(error).to.be.instanceOf(ValidationError);
            expect((error as ValidationError).issues).to.deep.equal(issues);
            expect((error as ValidationError).kind).to.equal('validation');
        }
    });
});
