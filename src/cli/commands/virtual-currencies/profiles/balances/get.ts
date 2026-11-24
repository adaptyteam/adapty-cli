import { validateProfileAddress } from '../../../../../sdk/adapty/virtual-currencies/index.js';
import { assertValid } from '../../../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../../../base/adapty/index.js';
import { appIdFlag } from '../../../../input/app.js';
import { profileAddress, profileAddressFlags } from '../../../../input/virtual-currencies.js';
import { renderBalances } from '../../../../views/virtual-currencies/ledger.js';

import type { Balances } from '../../../../../sdk/adapty/index.js';

export default class VirtualCurrenciesProfilesBalancesGet extends AdaptyCommand {
    static override description = 'The balance of each currency of one profile: held, available, and the coins that expire '
        + 'and when. The profile by --profile or by --customer-user-id, exactly one of them';

    static override examples = [
        '<%= config.bin %> virtual-currencies profiles balances get --app APP_UUID --customer-user-id user-42',
        '<%= config.bin %> virtual-currencies profiles balances get --app APP_UUID --profile PROFILE_UUID',
    ];

    static override flags = { ...appIdFlag, ...profileAddressFlags };

    async run(): Promise<Balances> {
        const { flags } = await this.parse(VirtualCurrenciesProfilesBalancesGet);
        const address = profileAddress(flags);

        assertValid(validateProfileAddress(address));

        const balances = await this.adapty.virtualCurrencies.profiles.balances(flags.app, address);

        this.render(balances, renderBalances);

        return balances;
    }
}
