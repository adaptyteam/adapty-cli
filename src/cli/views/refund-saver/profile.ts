import type { RefundSaverProfileSettings } from '../../../sdk/adapty/index.js';

const NONE = '—';

/** Both settings, `—` for one that is not set: an unset setting follows the preference of the store. */
export const renderProfileSettings = (settings: RefundSaverProfileSettings): string => [
    `Custom Preference: ${settings.custom_preference ?? NONE}`,
    `Consent: ${settings.consent === null ? NONE : String(settings.consent)}`,
].join('\n');
