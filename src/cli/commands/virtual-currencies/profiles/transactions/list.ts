import { validateProfileAddress } from '../../../../../sdk/adapty/virtual-currencies/index.js';
import { assertValid } from '../../../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../../../base/adapty/index.js';
import { appIdFlag } from '../../../../input/app.js';
import { cursorPageFlags, cursorPageParams } from '../../../../input/pagination.js';
import {
    ledgerFilterFlags,
    ledgerParams,
    optionalPeriodFlags,
    profileAddress,
    profileAddressFlags,
} from '../../../../input/virtual-currencies.js';
import { LEDGER_HELP, nextPageCommand, renderLedgerPage } from '../../../../views/virtual-currencies/ledger.js';

import type { LedgerPage } from '../../../../../sdk/adapty/index.js';

export default class VirtualCurrenciesProfilesTransactionsList extends AdaptyCommand {
    static override summary = 'One page of the coin transactions of one profile, newest first';

    static override description = `The profile by --profile or by --customer-user-id, exactly one of them. The period `
        + `is optional.\n\n${LEDGER_HELP}`;

    static override examples = [
        '<%= config.bin %> virtual-currencies profiles transactions list --app APP_UUID --customer-user-id user-42',
        '<%= config.bin %> virtual-currencies profiles transactions list --app APP_UUID --profile PROFILE_UUID '
        + '--date-from 2026-11-01 --cursor NEXT_CURSOR',
    ];

    static override flags = {
        ...appIdFlag,
        ...profileAddressFlags,
        ...optionalPeriodFlags,
        ...ledgerFilterFlags,
        ...cursorPageFlags,
    };

    async run(): Promise<LedgerPage> {
        const { flags } = await this.parse(VirtualCurrenciesProfilesTransactionsList);
        const address = profileAddress(flags);

        assertValid(validateProfileAddress(address));

        const query = { ...ledgerParams(flags), ...cursorPageParams(flags) };
        const page = await this.adapty.virtualCurrencies.profiles.transactions(flags.app, address, query);
        const command = [this.config.bin, ...(this.id?.split(':') ?? [])];

        this.render(page, value => renderLedgerPage(value, cursor => nextPageCommand(command, this.argv, cursor)));

        return page;
    }
}
