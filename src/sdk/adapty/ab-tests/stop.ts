import type { AbTestType } from './model.js';
import type { Issue } from '../../core/errors.js';

/**
 * What the stopped audience shows afterwards. The server names the content kind in the field, so a
 * paywall test takes the paywall fields and a flow test the flow ones. None set: no content, the
 * audience leaves the placement.
 */
export type StopAbTestInput = {
    anotherFlowIdToRun?: string | undefined;
    anotherPaywallIdToRun?: string | undefined;
    winnerFlowId?: string | undefined;
    winnerPaywallId?: string | undefined;
};

type StopRequest = {
    another_flow_id_to_run?: string;
    another_paywall_id_to_run?: string;
    winner_flow_id?: string;
    winner_paywall_id?: string;
};

export const validateStop = (input: StopAbTestInput): Issue[] => {
    const given = Object.values(input).filter(value => value !== undefined);

    return given.length > 1 ? [{ message: 'pass one of a winner, other content or none' }] : [];
};

/** The field of a content id, by the type of the test that is stopped. */
export const stopContent = (
    type: AbTestType,
    choice: { id: string; kind: 'other' | 'winner' },
): StopAbTestInput => {
    if (choice.kind === 'winner') {
        return type === 'paywall' ? { winnerPaywallId: choice.id } : { winnerFlowId: choice.id };
    }

    return type === 'paywall' ? { anotherPaywallIdToRun: choice.id } : { anotherFlowIdToRun: choice.id };
};

/** An absent field is left out: no content is the empty body `{}`. */
export const toStopRequest = (input: StopAbTestInput): StopRequest => {
    const body: StopRequest = {};

    if (input.winnerPaywallId !== undefined) {
        body.winner_paywall_id = input.winnerPaywallId;
    }

    if (input.winnerFlowId !== undefined) {
        body.winner_flow_id = input.winnerFlowId;
    }

    if (input.anotherPaywallIdToRun !== undefined) {
        body.another_paywall_id_to_run = input.anotherPaywallIdToRun;
    }

    if (input.anotherFlowIdToRun !== undefined) {
        body.another_flow_id_to_run = input.anotherFlowIdToRun;
    }

    return body;
};
