import { expect } from 'chai';

import { attributionErrorParser } from '../../../src/sdk/attribution/index.js';

/** The `errors[]` envelope the attribution backend sends for every rejection. */
describe('attributionErrorParser', () => {
    it('takes the code of the first item and prefixes the message with the field it names', () => {
        const parsed = attributionErrorParser(422, {
            errors: [{
                error_code: 'attribution_unknown_metric',
                field_name: 'metrics',
                message: 'Unknown metric: roas_d9000',
                status_code: 422,
            }],
        });

        expect(parsed).to.deep.equal({
            code: 'attribution_unknown_metric',
            message: 'metrics: Unknown metric: roas_d9000',
        });
    });

    it('joins every item into the message, and prints an item without a field bare', () => {
        const parsed = attributionErrorParser(422, {
            errors: [
                { error_code: 'attribution_validation_error', field_name: 'date_from', message: 'invalid date', status_code: 422 },
                { error_code: 'attribution_validation_error', field_name: null, message: 'too many metrics', status_code: 422 },
            ],
        });

        expect(parsed).to.deep.equal({
            code: 'attribution_validation_error',
            message: 'date_from: invalid date; too many metrics',
        });
    });

    it('keeps the code of an access rejection', () => {
        const parsed = attributionErrorParser(402, {
            errors: [{
                error_code: 'attribution_access_required',
                field_name: null,
                message: 'Attribution is not enabled for this company',
                status_code: 402,
            }],
        });

        expect(parsed).to.deep.equal({
            code: 'attribution_access_required',
            message: 'Attribution is not enabled for this company',
        });
    });

    it('falls back to the code when the items carry no message', () => {
        expect(attributionErrorParser(429, { errors: [{ error_code: 'attribution_busy' }] })).to.deep.equal({
            code: 'attribution_busy',
            message: 'attribution_busy',
        });
    });

    it('reads a body outside the envelope the default way, and says nothing about an unknown one', () => {
        expect(attributionErrorParser(404, { detail: 'Not Found' })).to.deep.equal({
            code: undefined,
            message: 'Not Found',
        });

        expect(attributionErrorParser(502, 'Bad Gateway')).to.deep.equal({});
        expect(attributionErrorParser(500, { errors: [] })).to.deep.equal({ code: undefined, message: undefined });
    });
});
