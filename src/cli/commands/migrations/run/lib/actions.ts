import type { Action, Envelope } from '../../../../../sdk/adapty/index.js';

const offered = (envelope: Envelope): Action[] => [...envelope.next_actions, ...envelope.available_actions];

export const findAction = (envelope: Envelope, actionId: string): Action | undefined => {
    return offered(envelope).find(action => action.action_id === actionId);
};

const line = (action: Action): string => `  ${action.action_id}  (${action.kind})  ${action.title}`;

export const unknownActionMessage = (envelope: Envelope, actionId: string): string => {
    const actions = offered(envelope);

    if (actions.length === 0) {
        const { state, summary } = envelope.migration;

        return `No action \`${actionId}\` here: this migration offers none right now (state: ${state}).\n${summary}`;
    }

    return [`No action \`${actionId}\` here. Available now:`, ...actions.map(line)].join('\n');
};

export const unsupportedActionMessage = (action: Action): string => {
    const detail = action.detail === null ? '' : `\n${action.detail}`;

    if (action.kind === 'upload') {
        return `\`${action.action_id}\` (${action.title}) uploads a file, which this adapty-cli cannot do yet.${detail}\nUse the dashboard or an offered Cloud Export action.`;
    }

    return `\`${action.action_id}\` (${action.title}) is a "${action.kind}" action: it needs a newer adapty-cli.${detail}`;
};
