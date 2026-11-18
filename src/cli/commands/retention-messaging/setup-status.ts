import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { renderRecord } from '../../views/record.js';

import type { RetentionSetupStatus } from '../../../sdk/adapty/retention-messaging/index.js';

export default class RetentionMessagingSetupStatus extends AdaptyCommand {
    static override summary = 'Show the Retention Messaging setup of an app';

    static override description = 'The App Store key, the Apple access, the realtime URL of each mode and the performance test, '
        + 'as the dashboard shows them. It works also for an app with no App Store key. The read can save the result of a running '
        + 'Apple performance test, as the dashboard does.';

    static override examples = ['<%= config.bin %> retention-messaging setup-status --app UUID'];

    static override flags = { ...appIdFlag };

    async run(): Promise<RetentionSetupStatus> {
        const { flags } = await this.parse(RetentionMessagingSetupStatus);
        const status = await this.adapty.retentionMessaging.setupStatus(flags.app);

        this.render(status, renderRecord);

        return status;
    }
}
