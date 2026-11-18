import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { renderTurnOff, TURN_OFF_NOTE } from '../../views/refund-saver/state.js';

import type { RefundSaverSwitch } from '../../../sdk/adapty/index.js';

export default class RefundSaverOff extends AdaptyCommand {
    static override description = `Turn Refund Saver off for an app, in both stores. ${TURN_OFF_NOTE}`;
    static override examples = ['<%= config.bin %> refund-saver off --app UUID'];
    static override flags = { ...appIdFlag };

    async run(): Promise<RefundSaverSwitch> {
        const { flags } = await this.parse(RefundSaverOff);
        const answer = await this.adapty.refundSaver.off(flags.app);

        this.render(answer, renderTurnOff);

        return answer;
    }
}
