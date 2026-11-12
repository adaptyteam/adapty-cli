import { assertValid } from '../../core/validation.js';

import { toAcceptRequest, validateAccept } from './accept.js';
import { toBatchRequest, validateCreate } from './create.js';
import { listQuery, validateList } from './list.js';

import type { AcceptHypothesisInput } from './accept.js';
import type { CreatedHypotheses, CreateHypothesesInput } from './create.js';
import type { ListHypothesesParams } from './list.js';
import type { Hypothesis, HypothesisResult, HypothesisRows, HypothesisSummary } from './model.js';
import type { Http } from '../../core/http/index.js';
import type { Paginated } from '../pagination.js';

/** The transitions that take no body. */
export type BareHypothesisAction = 'dismiss' | 'restore' | 'unaccept' | 'unlink';

/**
 * Every write is safe to resend, so every write is retried like a read: a create is keyed by its
 * client-minted id, and a transition the row has already made answers 200 with the row unchanged.
 */
export const hypotheses = (http: Http) => {
    const base = (appId: string): string => `/apps/${appId}/hypotheses`;
    const one = (appId: string, hypothesisId: string): string => `${base(appId)}/${hypothesisId}`;

    const transition = (appId: string, hypothesisId: string, action: string, body: object = {}) =>
        http.post<Hypothesis>(`${one(appId, hypothesisId)}/${action}`, body, { idempotent: true });

    return {
        /** The hypotheses linked to a test: one, or one per child of a crossplacement test. 404 when none is. */
        byAbTest: (appId: string, abTestId: string) => http.get<HypothesisRows>(`${base(appId)}/by-ab-test/${abTestId}`),
        get: (appId: string, hypothesisId: string) => http.get<Hypothesis>(one(appId, hypothesisId)),
        list: async (appId: string, params?: ListHypothesesParams): Promise<Paginated<Hypothesis>> => {
            assertValid(validateList(params));

            return http.get<Paginated<Hypothesis>>(base(appId), { query: listQuery(params) });
        },
        /** The backlog per placement: proposed and accepted rows only. */
        summary: (appId: string) => http.get<HypothesisSummary>(`${base(appId)}/summary`),

        /**
         * Always the batch route, so every item answers with its own 201 or 200. One transaction: one
         * error creates nothing.
         */
        create: async (appId: string, input: CreateHypothesesInput): Promise<CreatedHypotheses> => {
            assertValid(validateCreate(input));

            return http.post<CreatedHypotheses>(`${base(appId)}/batch`, toBatchRequest(input), { idempotent: true });
        },

        accept: async (appId: string, hypothesisId: string, input: AcceptHypothesisInput = {}): Promise<Hypothesis> => {
            assertValid(validateAccept(input));

            return transition(appId, hypothesisId, 'accept', toAcceptRequest(input));
        },

        /** Only a flow row in phase accepted; the test needs exactly two arms, one of them the subject flow. */
        link: (appId: string, hypothesisId: string, abTestId: string) =>
            transition(appId, hypothesisId, 'link', { ab_test_id: abTestId }),

        /** The user's verdict on an accepted, ended or applied row. */
        resolve: (appId: string, hypothesisId: string, result: HypothesisResult) =>
            transition(appId, hypothesisId, 'resolve', { result }),

        /** Overrides the verdict an A/B test gave; a verdict of the user is final. */
        reresolve: (appId: string, hypothesisId: string, result: HypothesisResult) =>
            transition(appId, hypothesisId, 'reresolve', { result }),

        act: (appId: string, hypothesisId: string, action: BareHypothesisAction) =>
            transition(appId, hypothesisId, action),
    };
};

export type HypothesesApi = ReturnType<typeof hypotheses>;
