import { AdaptyCommand } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { renderRecord } from '../../../views/record.js';

import type { RealtimeUrl } from '../../../../sdk/adapty/retention-messaging/index.js';

export default class RetentionMessagingRealtimeUrlGet extends AdaptyCommand {
    static override summary = 'Show the Adapty realtime URL for Apple Retention Messaging';

    static override description = 'One URL for both modes. `realtime-url configure` sets it in Apple.';

    static override examples = ['<%= config.bin %> retention-messaging realtime-url get --app UUID'];

    static override flags = { ...appIdFlag };

    async run(): Promise<RealtimeUrl> {
        const { flags } = await this.parse(RetentionMessagingRealtimeUrlGet);
        const url = await this.adapty.retentionMessaging.realtimeUrl(flags.app);

        this.render(url, renderRecord);

        return url;
    }
}
