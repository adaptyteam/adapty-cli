import type { RefundSaverState, RefundSaverStores, RefundSaverSwitch } from '../../../sdk/adapty/index.js';

/** Help text of `off`, and the line after its state. */
export const TURN_OFF_NOTE = 'Turning Refund Saver off does not cancel the Refund Saver add-on. '
    + 'The account owner manages it in Billing in the Adapty dashboard.';

export const renderStores = (stores: RefundSaverStores): string => [
    'App Store:',
    `  Preference: ${stores.app_store.preference}`,
    `  Needs Consent: ${String(stores.app_store.refund_saver_needs_consent)}`,
    'Play Store:',
    `  Preference: ${stores.play_store.preference}`,
].join('\n');

export const renderState = (state: RefundSaverState): string =>
    `Refund Saver: ${state.enabled ? 'on' : 'off'}\n${renderStores(state.stores)}`;

/** The state after `on`; the note of the server is the last line. */
export const renderTurnOn = (answer: RefundSaverSwitch): string => {
    const lines = [renderState(answer)];

    if (answer.billing_note !== null) {
        lines.push('', `Note: ${answer.billing_note}`);
    }

    return lines.join('\n');
};

export const renderTurnOff = (answer: RefundSaverSwitch): string => `${renderState(answer)}\n\nNote: ${TURN_OFF_NOTE}`;
