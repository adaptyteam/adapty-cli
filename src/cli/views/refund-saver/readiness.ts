import type { RefundSaverReadiness } from '../../../sdk/adapty/index.js';

const MISSING_SETUP = {
    app_store: 'set the bundle ID and the App Store Connect API key ID, issuer ID and private key in App settings',
    play_store: 'set the bundle ID and the service account key in App settings',
} as const;

const STORE_NAMES = { app_store: 'App Store', play_store: 'Play Store' } as const;

/** One line for each store; a store that is not ready names the setup it misses. */
export const renderReadiness = (readiness: RefundSaverReadiness): string =>
    (['app_store', 'play_store'] as const)
        .map(store => (readiness[store]
            ? `${STORE_NAMES[store]}: ready`
            : `${STORE_NAMES[store]}: not ready: ${MISSING_SETUP[store]}`))
        .join('\n');
