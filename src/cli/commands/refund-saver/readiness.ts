import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { renderReadiness } from '../../views/refund-saver/readiness.js';

import type { RefundSaverReadiness } from '../../../sdk/adapty/index.js';

export default class RefundSaverReadinessCommand extends AdaptyCommand {
    static override description = 'Show whether each store has the credentials that Refund Saver needs, '
        + 'and the setup a store misses (App Store: bundle ID and the App Store Connect API key ID, issuer ID and private key; '
        + 'Play Store: bundle ID and service account key)';

    static override examples = ['<%= config.bin %> refund-saver readiness --app UUID'];
    static override flags = { ...appIdFlag };

    async run(): Promise<RefundSaverReadiness> {
        const { flags } = await this.parse(RefundSaverReadinessCommand);
        const readiness = await this.adapty.refundSaver.readiness(flags.app);

        this.render(readiness, renderReadiness);

        return readiness;
    }
}
