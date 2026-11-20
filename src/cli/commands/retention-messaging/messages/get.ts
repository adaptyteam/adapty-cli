import { AdaptyCommand } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { messageIdArg } from '../../../input/retention-messaging.js';
import { renderRecord } from '../../../views/record.js';

import type { RetentionMessageAnswer } from '../../../../sdk/adapty/retention-messaging/index.js';

export default class RetentionMessagingMessagesGet extends AdaptyCommand {
    static override summary = 'Show one retention message';

    static override description = 'The en-US texts, the image, the bullet points with their icons, the products with their '
        + 'associations and each localization with its review status. The read asks Apple for review results and saves them, '
        + 'as the dashboard does: it can start to show a message that Apple has approved to subscribers.';

    static override examples = ['<%= config.bin %> retention-messaging messages get MESSAGE_ID --app UUID'];

    static override args = { ...messageIdArg };

    static override flags = { ...appIdFlag };

    async run(): Promise<RetentionMessageAnswer> {
        const { args, flags } = await this.parse(RetentionMessagingMessagesGet);
        const answer = await this.adapty.retentionMessaging.messages.get(flags.app, args.message_id);

        this.render(answer, value => renderRecord(value.data));

        return answer;
    }
}
