import { AdaptyCommand } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { profileIdArg } from '../../../input/refund-saver.js';
import { renderProfileSettings } from '../../../views/refund-saver/profile.js';

import type { RefundSaverProfileSettings } from '../../../../sdk/adapty/index.js';

export default class RefundSaverProfileGet extends AdaptyCommand {
    static override args = { ...profileIdArg };
    static override description = 'Show the Refund Saver settings of one profile: its custom preference and its consent';
    static override examples = ['<%= config.bin %> refund-saver profile get --app UUID PROFILE_ID'];
    static override flags = { ...appIdFlag };

    async run(): Promise<RefundSaverProfileSettings> {
        const { args, flags } = await this.parse(RefundSaverProfileGet);
        const settings = await this.adapty.refundSaver.profile.get(flags.app, args.profile_id);

        this.render(settings, renderProfileSettings);

        return settings;
    }
}
