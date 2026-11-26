import { AdaptyCommand, periodFlags } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';
import { cursorPageFlags, cursorPageParams } from '../../../input/pagination.js';
import { ledgerFilterFlags, ledgerParams } from '../../../input/virtual-currencies.js';
import { LEDGER_HELP, nextPageCommand, renderLedgerPage } from '../../../views/virtual-currencies/ledger.js';

import type { LedgerPage } from '../../../../sdk/adapty/index.js';

export default class VirtualCurrenciesTransactionsList extends AdaptyCommand {
    static override summary = 'One page of the coin transactions of an app in a period, newest first';
    static override description = LEDGER_HELP;

    static override examples = [
        '<%= config.bin %> virtual-currencies transactions list --app APP_UUID --date-from 2026-11-01 --date-to 2026-11-07',
        '<%= config.bin %> virtual-currencies transactions list --app APP_UUID --date-from 2026-11-01 --date-to 2026-11-07 '
        + '--timezone Europe/Berlin --currency-code gems --cursor NEXT_CURSOR',
    ];

    static override flags = { ...appIdFlag, ...periodFlags, ...ledgerFilterFlags, ...cursorPageFlags };

    async run(): Promise<LedgerPage> {
        const { flags } = await this.parse(VirtualCurrenciesTransactionsList);
        const query = { ...ledgerParams(flags), ...cursorPageParams(flags) };
        const page = await this.adapty.virtualCurrencies.transactions.list(flags.app, query);
        const command = [this.config.bin, ...(this.id?.split(':') ?? [])];

        this.render(page, value => renderLedgerPage(value, cursor => nextPageCommand(command, this.argv, cursor)));

        return page;
    }
}
