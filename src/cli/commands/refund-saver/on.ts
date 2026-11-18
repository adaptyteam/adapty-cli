import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { renderTurnOn } from '../../views/refund-saver/state.js';

import type { RefundSaverSwitch } from '../../../sdk/adapty/index.js';

export default class RefundSaverOn extends AdaptyCommand {
    static override description = 'Turn Refund Saver on for an app, in both stores. '
        + 'The API can refuse `on` with 409 (exit 4). A refusal changes nothing; read `error.code` in --json. '
        + '`on` answers with a note (`billing_note` in --json); the CLI prints it.';

    static override examples = ['<%= config.bin %> refund-saver on --app UUID'];
    static override flags = { ...appIdFlag };

    async run(): Promise<RefundSaverSwitch> {
        const { flags } = await this.parse(RefundSaverOn);
        const answer = await this.adapty.refundSaver.on(flags.app);

        this.render(answer, renderTurnOn);

        return answer;
    }
}
