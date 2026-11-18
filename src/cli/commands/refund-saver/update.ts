import { Flags } from '@oclif/core';

import { appStorePreferences, playStorePreferences } from '../../../sdk/adapty/index.js';
import { validateUpdateRefundSaver } from '../../../sdk/adapty/refund-saver/index.js';
import { assertValid } from '../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { renderStores } from '../../views/refund-saver/state.js';

import type { RefundSaverPreferences, UpdateRefundSaverInput } from '../../../sdk/adapty/index.js';

export default class RefundSaverUpdate extends AdaptyCommand {
    static override description = 'Change the refund preferences of the stores. A flag that is not given keeps its value; '
        + 'turn Refund Saver on or off with `refund-saver on` and `refund-saver off`';

    static override examples = [
        '<%= config.bin %> refund-saver update --app UUID --app-store-preference always_decline',
        '<%= config.bin %> refund-saver update --app UUID --play-store-preference always_refund --no-needs-consent',
    ];

    static override flags = {
        ...appIdFlag,
        'app-store-preference': Flags.option({
            description: 'The refund preference for App Store refund requests',
            options: appStorePreferences,
        })(),
        'needs-consent': Flags.boolean({
            allowNo: true,
            description: 'Whether Refund Saver sends the data of an App Store user only after the user consents',
        }),
        'play-store-preference': Flags.option({
            description: 'The refund preference for Play Store refund requests',
            options: playStorePreferences,
        })(),
    };

    async run(): Promise<RefundSaverPreferences> {
        const { flags } = await this.parse(RefundSaverUpdate);

        const input: UpdateRefundSaverInput = {
            appStorePreference: flags['app-store-preference'],
            needsConsent: flags['needs-consent'],
            playStorePreference: flags['play-store-preference'],
        };

        // Before the token: no flag at all is a usage error, not a request
        assertValid(validateUpdateRefundSaver(input));

        const preferences = await this.adapty.refundSaver.update(flags.app, input);

        this.render(preferences, value => renderStores(value.stores));

        return preferences;
    }
}
