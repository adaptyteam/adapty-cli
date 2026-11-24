import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { currencyIdArg } from '../../input/virtual-currencies.js';
import { renderCurrency } from '../../views/virtual-currencies/currencies.js';

import type { VirtualCurrencyDetail } from '../../../sdk/adapty/index.js';

export default class VirtualCurrenciesGet extends AdaptyCommand {
    static override description = 'Get a virtual currency with its product mappings: the coins that each purchase of a '
        + 'product gives. Its updated_at is the --expected-updated-at of a mapping write';

    static override examples = ['<%= config.bin %> virtual-currencies get CURRENCY_UUID --app APP_UUID'];
    static override args = { ...currencyIdArg };
    static override flags = { ...appIdFlag };

    async run(): Promise<VirtualCurrencyDetail> {
        const { args, flags } = await this.parse(VirtualCurrenciesGet);
        const currency = await this.adapty.virtualCurrencies.get(flags.app, args.virtual_currency_id);

        this.render(currency, renderCurrency);

        return currency;
    }
}
