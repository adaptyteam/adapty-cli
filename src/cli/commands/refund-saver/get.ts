import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { renderState } from '../../views/refund-saver/state.js';

import type { RefundSaverState } from '../../../sdk/adapty/index.js';

export default class RefundSaverGet extends AdaptyCommand {
    static override description = 'Show whether Refund Saver is on for an app, and the refund preference of each store';
    static override examples = ['<%= config.bin %> refund-saver get --app UUID'];
    static override flags = { ...appIdFlag };

    async run(): Promise<RefundSaverState> {
        const { flags } = await this.parse(RefundSaverGet);
        const state = await this.adapty.refundSaver.get(flags.app);

        this.render(state, renderState);

        return state;
    }
}
