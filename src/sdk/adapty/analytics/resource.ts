import { assertValid } from '../../core/validation.js';

import { toChartRequest, validateChart } from './chart.js';
import { toCohortRequest, validateCohort } from './cohort.js';
import { toConversionRequest, validateConversion } from './conversion.js';
import { toFunnelRequest, validateFunnel } from './funnel.js';
import { toLtvRequest, validateLtv } from './ltv.js';
import { toRetentionRequest, validateRetention } from './retention.js';
import { validateFilterValues } from './values.js';

import type { CatalogResponse } from './catalog.js';
import type { ChartInput, ChartResponse } from './chart.js';
import type { CohortInput, CohortResponse } from './cohort.js';
import type { ConversionInput, ConversionResponse } from './conversion.js';
import type { FunnelInput, FunnelResponse } from './funnel.js';
import type { LtvInput, LtvResponse } from './ltv.js';
import type { RetentionInput, RetentionResponse } from './retention.js';
import type { FilterValuesInput, FilterValuesResponse } from './values.js';
import type { Http } from '../../core/http/index.js';

const base = (appId: string): string => `/apps/${appId}/analytics`;

/**
 * Every path of the analytics of an app in one place. The catalog and the values are GETs and keep the
 * transport's retry. The six operations are POSTs that run analytics queries under a rate limit of the app:
 * sent once, never retried, and a 429 reaches the caller with the server's wait.
 *
 * The validating methods are async on purpose — a broken rule then arrives as a rejected promise, like a
 * network failure, and one await covers both.
 */
export const analytics = (http: Http) => ({
    catalog: (appId: string) => http.get<CatalogResponse>(`${base(appId)}/catalog`),

    chart: async (input: ChartInput): Promise<ChartResponse> => {
        assertValid(validateChart(input));

        return http.post(`${base(input.appId)}/metrics`, toChartRequest(input), { idempotent: false });
    },

    cohort: async (input: CohortInput): Promise<CohortResponse> => {
        assertValid(validateCohort(input));

        return http.post(`${base(input.appId)}/cohort`, toCohortRequest(input), { idempotent: false });
    },

    conversion: async (input: ConversionInput): Promise<ConversionResponse> => {
        assertValid(validateConversion(input));

        return http.post(`${base(input.appId)}/conversion`, toConversionRequest(input), { idempotent: false });
    },

    funnel: async (input: FunnelInput): Promise<FunnelResponse> => {
        assertValid(validateFunnel(input));

        return http.post(`${base(input.appId)}/funnel`, toFunnelRequest(input), { idempotent: false });
    },

    ltv: async (input: LtvInput): Promise<LtvResponse> => {
        assertValid(validateLtv(input));

        return http.post(`${base(input.appId)}/ltv`, toLtvRequest(input), { idempotent: false });
    },

    retention: async (input: RetentionInput): Promise<RetentionResponse> => {
        assertValid(validateRetention(input));

        return http.post(`${base(input.appId)}/retention`, toRetentionRequest(input), { idempotent: false });
    },

    values: async (input: FilterValuesInput): Promise<FilterValuesResponse> => {
        assertValid(validateFilterValues(input));

        return http.get(`${base(input.appId)}/values`, { query: { dimension: input.dimension } });
    },
});

export type AnalyticsApi = ReturnType<typeof analytics>;
