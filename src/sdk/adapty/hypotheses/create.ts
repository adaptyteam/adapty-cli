import { randomUUID } from 'node:crypto';

import type { Hypothesis } from './model.js';

/** A create body as the server takes it, snake_case; the server refuses a key it does not know. */
export type HypothesisCreateBody = Record<string, unknown>;

export type CreateHypothesesInput = {
    /** Every item needs its `hypothesis_id`: `withHypothesisIds` mints the missing ones. */
    hypotheses: readonly HypothesisCreateBody[];
    /** Create even when an open hypothesis proposes the same change. */
    force?: boolean | undefined;
};

/** 201: created now. 200: the server already had this id with the same payload and answers with the stored row. */
export type CreatedHypothesis = {
    data: Hypothesis;
    hypothesis_id: string;
    status: 200 | 201;
};

export type CreatedHypotheses = {
    data: CreatedHypothesis[];
};

type BatchRequest = {
    hypotheses: HypothesisCreateBody[];
};

/**
 * The client names a new hypothesis, so a resend of the same payload under the same id replays the
 * stored row instead of creating a second one. `minted` lists the ids made here, for the caller to
 * keep: a retry with the same payload needs them.
 */
export const withHypothesisIds = (
    hypotheses: readonly HypothesisCreateBody[],
    mint: () => string = randomUUID,
): { hypotheses: HypothesisCreateBody[]; minted: string[] } => {
    const minted: string[] = [];

    const withIds = hypotheses.map((body) => {
        if (body.hypothesis_id !== undefined && body.hypothesis_id !== null && body.hypothesis_id !== '') {
            return body;
        }

        const id = mint();

        minted.push(id);

        const { hypothesis_id: _absent, ...rest } = body;

        return { hypothesis_id: id, ...rest };
    });

    return { hypotheses: withIds, minted };
};

export const toBatchRequest = (input: CreateHypothesesInput): BatchRequest => ({
    hypotheses: input.hypotheses.map(body => (input.force === true ? { ...body, force: true } : { ...body })),
});
