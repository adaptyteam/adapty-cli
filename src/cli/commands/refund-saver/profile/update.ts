import { Flags } from '@oclif/core';

import { customPreferences } from '../../../../sdk/adapty/index.js';
import { validateProfileSettings } from '../../../../sdk/adapty/refund-saver/index.js';
import { assertValid } from '../../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { profileIdArg } from '../../../input/refund-saver.js';
import { renderProfileSettings } from '../../../views/refund-saver/profile.js';

import type { RefundSaverProfileSettings, UpdateProfileSettingsInput } from '../../../../sdk/adapty/index.js';

export default class RefundSaverProfileUpdate extends AdaptyCommand {
    static override args = { ...profileIdArg };
    static override description = 'Change the Refund Saver settings of one profile. A flag that is not given keeps its value';

    static override examples = [
        '<%= config.bin %> refund-saver profile update --app UUID PROFILE_ID --custom-preference decline',
        '<%= config.bin %> refund-saver profile update --app UUID PROFILE_ID --consent',
    ];

    static override flags = {
        ...appIdFlag,
        'consent': Flags.boolean({
            allowNo: true,
            description: 'Whether the user consents that Refund Saver sends their data to the store',
        }),
        'custom-preference': Flags.option({
            description: 'The refund preference for this profile, over the preference of the store',
            options: customPreferences,
        })(),
    };

    async run(): Promise<RefundSaverProfileSettings> {
        const { args, flags } = await this.parse(RefundSaverProfileUpdate);
        const input: UpdateProfileSettingsInput = { consent: flags.consent, customPreference: flags['custom-preference'] };

        assertValid(validateProfileSettings(input));

        const settings = await this.adapty.refundSaver.profile.update(flags.app, args.profile_id, input);

        this.render(settings, renderProfileSettings);

        return settings;
    }
}
