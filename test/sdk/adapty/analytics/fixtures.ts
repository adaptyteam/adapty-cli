import type { AnalyticsQueryInput } from '../../../../src/sdk/adapty/analytics/query.js';
import type { Issue } from '../../../../src/sdk/core/errors.js';

export const paths = (issues: readonly Issue[]): (string | undefined)[] => issues.map(issue => issue.path);

/** A valid quarter: each operation's table starts from it. */
export const quarter: AnalyticsQueryInput = {
    appId: '3f1c2a4e-8b7d-4c1e-9a2f-5d6e7f8a9b0c',
    dateFrom: '2026-07-01',
    dateTo: '2026-09-30',
};
