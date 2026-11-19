import { Flags } from '@oclif/core';

import { retentionMessageStates, retentionMessageTypes, retentionOrderings } from '../../../../sdk/adapty/retention-messaging/index.js';
import { AdaptyCommand } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { pageParams, paginationFlags } from '../../../input/pagination.js';
import { modeFlag } from '../../../input/retention-messaging.js';
import { renderPage } from '../../../views/list.js';

import type { RetentionMessageList } from '../../../../sdk/adapty/retention-messaging/index.js';

export default class RetentionMessagingMessagesList extends AdaptyCommand {
    static override summary = 'List the retention messages of one mode, with their metrics';

    static override description = [
        'Each row has the name, type, state and six lifetime metrics, as the dashboard table. A display is one '
        + '(subscription, UTC day) pair. shown = retained + churned + pending. retention_rate = retained / (retained + churned) '
        + '× 100, one decimal. save_rate = saved_users / matured displays (older than 24 hours) × 100, one decimal. A rate with '
        + 'a zero denominator is 0.0. saved_revenue is in USD before the Apple commission, two decimals.',
        'The read asks Apple for review results and saves them, as the dashboard does: it can start to show a message that '
        + 'Apple has approved to subscribers. meta.exists says whether the mode has any message, with no filter.',
    ].join('\n\n');

    static override examples = [
        '<%= config.bin %> retention-messaging messages list --app UUID --mode production --state live',
        '<%= config.bin %> retention-messaging messages list --app UUID --mode sandbox --search "Winter" --ordering -name',
    ];

    static override flags = {
        ...appIdFlag,
        ...modeFlag('The Apple environment of the messages'),
        ordering: Flags.option({ description: 'Sort order; a minus sorts descending', options: retentionOrderings })(),
        search: Flags.string({ description: 'Part of the name (any case), or the exact message ID' }),
        state: Flags.option({ description: 'Only the messages in this state', options: retentionMessageStates })(),
        type: Flags.option({ description: 'Only the messages of this type', options: retentionMessageTypes })(),
        ...paginationFlags,
    };

    async run(): Promise<RetentionMessageList> {
        const { flags } = await this.parse(RetentionMessagingMessagesList);

        const list = await this.adapty.retentionMessaging.messages.list(flags.app, {
            mode: flags.mode,
            ordering: flags.ordering,
            search: flags.search,
            state: flags.state,
            type: flags.type,
            ...pageParams(flags),
        });

        this.render(list, renderPage);

        return list;
    }
}
