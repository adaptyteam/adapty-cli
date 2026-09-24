import { expect } from 'chai';

import { renderReport } from '../../../../../src/cli/commands/attribution/report/lib/render.js';

import type { ReportResponse } from '../../../../../src/sdk/attribution/index.js';

const response = (data: ReportResponse['data']): ReportResponse => ({
    data,
    meta: { query: {} },
    success: true,
});

/** `test/commands/attribution.test.ts` covers what the command puts in; the view's branches are here. */
describe('renderReport', () => {
    it('prints a dash for a value that could not be computed, and a real zero as 0', () => {
        expect(renderReport(response({
            rows: [{ country: 'US', installs: 0, d7_roas: null }],
            totals: { installs: 0, d7_roas: null },
        }))).to.equal('country: US\ninstalls: 0\nd7_roas: —\n\nTotals\ninstalls: 0\nd7_roas: —');
    });

    it('separates rows with --- and leaves the totals block out when there are none', () => {
        expect(renderReport(response({
            rows: [{ country: 'US', spend: 1.5 }, { country: 'GB', spend: 2 }],
            totals: null,
        }))).to.equal('country: US\nspend: 1.5\n---\ncountry: GB\nspend: 2');
    });

    it('says so when the period has no rows', () => {
        expect(renderReport(response({ rows: [], totals: null }))).to.equal('No rows for this period.');
    });
});
