import { expect } from 'chai';

import { developerErrorParser } from '../../../src/sdk/adapty/index.js';

/** The bodies the developer API actually sends, taken from the published src/lib/errors.ts. */
describe('developerErrorParser', () => {
    it('joins field errors into the message and keeps the code', () => {
        const parsed = developerErrorParser(400, {
            error_code: 'validation_error',
            errors: { apple_bundle_id: ['already used'], title: ['must not be blank'] },
        });

        expect(parsed).to.deep.equal({
            code: 'validation_error',
            message: 'apple_bundle_id: already used; title: must not be blank',
        });
    });

    it('prints a non_field_errors message without a field prefix', () => {
        const parsed = developerErrorParser(400, {
            error_code: 'validation_error',
            errors: { non_field_errors: ['the app already exists'] },
        });

        expect(parsed.message).to.equal('the app already exists');
    });

    it('falls back to the code when the server sends no field errors', () => {
        expect(developerErrorParser(404, { error_code: 'app_not_found' })).to.deep.equal({
            code: 'app_not_found',
            message: 'app_not_found',
        });
    });

    it('reads the short shape the auth endpoints use', () => {
        expect(developerErrorParser(400, { error: 'authorization_pending' })).to.deep.equal({
            code: 'authorization_pending',
            message: 'authorization_pending',
        });
    });

    it('says nothing about a body it does not recognise, leaving the status to speak', () => {
        expect(developerErrorParser(500, 'Bad Gateway')).to.deep.equal({});
        expect(developerErrorParser(500, { detail: 'nope' })).to.deep.equal({});
    });
});
