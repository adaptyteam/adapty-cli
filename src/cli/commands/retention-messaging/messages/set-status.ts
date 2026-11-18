import { Flags } from '@oclif/core';

import { retentionStatusActions } from '../../../../sdk/adapty/retention-messaging/index.js';
import { AdaptyCommand } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { confirmAction, yesFlag } from '../../../input/confirm.js';
import { messageIdArg } from '../../../input/retention-messaging.js';
import { ASK_THE_USER, renderWritten } from '../../../views/retention-messaging.js';

import type { RetentionMessageAnswer, RetentionStatusAction } from '../../../../sdk/adapty/retention-messaging/index.js';

const effectOf = (action: RetentionStatusAction, messageId: string): string => (action === 'activate'
    ? `Activate retention message ${messageId}. After Apple approves it, Apple shows it to subscribers on the cancel screen.`
    : `Deactivate retention message ${messageId}. Apple stops showing it from now on; the displays that already happened stay.`);

export default class RetentionMessagingMessagesSetStatus extends AdaptyCommand {
    static override summary = 'Activate or deactivate a retention message';

    static override description = 'activate takes an inactive message, deactivate a live one. It asks first in both modes, '
        + 'sandbox and production (--yes; exit 6 when nobody can answer, exit 1 on no).';

    static override examples = [
        '<%= config.bin %> retention-messaging messages set-status MESSAGE_ID --app UUID --action deactivate --yes',
    ];

    static override args = { ...messageIdArg };

    static override flags = {
        ...appIdFlag,
        action: Flags.option({ description: 'What to do with the message', options: retentionStatusActions, required: true })(),
        ...yesFlag,
    };

    async run(): Promise<RetentionMessageAnswer> {
        const { args, flags } = await this.parse(RetentionMessagingMessagesSetStatus);

        await confirmAction({
            effect: `${effectOf(flags.action, args.message_id)}\n${ASK_THE_USER}`,
            interactive: this.interactive,
            signal: this.signal,
            yes: flags.yes,
        });

        const { messages } = this.adapty.retentionMessaging;
        const answer = await messages.setStatus(flags.app, args.message_id, flags.action);

        this.render(answer, renderWritten(flags.action === 'activate' ? 'Message activated!' : 'Message deactivated!'));

        return answer;
    }
}
