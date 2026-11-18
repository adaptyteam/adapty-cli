import { Flags } from '@oclif/core';

import { retentionMessageTypes } from '../../../../sdk/adapty/retention-messaging/index.js';
import { AdaptyCommand } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { modeFlag, suggestFlags } from '../../../input/retention-messaging.js';
import { uuidParser } from '../../../input/uuid.js';
import { renderItems } from '../../../views/retention-messaging.js';

import type { ProductSuggestions } from '../../../../sdk/adapty/retention-messaging/index.js';

export default class RetentionMessagingProductsSuggest extends AdaptyCommand {
    static override summary = 'Suggest products for a retention message';

    static override description = 'A product with a disabled_reason cannot be picked: used means another message of the '
        + 'same type in the mode has it; no_default_message means a promo message needs a default message on that product first. '
        + 'When you edit a message, give its id with --message-id so that its own products are not shown as used.';

    static override examples = [
        '<%= config.bin %> retention-messaging products suggest --app UUID --mode sandbox --type default --search annual',
    ];

    static override flags = {
        ...appIdFlag,
        ...modeFlag('The Apple environment of the message'),
        'type': Flags.option({ description: 'The type of the message', options: retentionMessageTypes, required: true })(),
        'message-id': Flags.string({
            description: 'The message you edit (ID)',
            parse: uuidParser('Invalid message ID format. Run `adapty retention-messaging messages list --app <app> --mode <mode>` to find it.'),
        }),
        ...suggestFlags,
    };

    async run(): Promise<ProductSuggestions> {
        const { flags } = await this.parse(RetentionMessagingProductsSuggest);

        const answer = await this.adapty.retentionMessaging.suggest.products(flags.app, {
            limit: flags.limit,
            messageId: flags['message-id'],
            mode: flags.mode,
            search: flags.search,
            type: flags.type,
        });

        this.render(answer, renderItems);

        return answer;
    }
}
