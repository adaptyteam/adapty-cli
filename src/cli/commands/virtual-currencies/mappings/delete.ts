import { AdaptyCommand } from '../../../base/adapty/index.js';
import { withWriteHints } from '../../../errors/virtual-currencies.js';
import { appIdFlag } from '../../../input/app.js';
import { yesFlag } from '../../../input/confirm.js';
import { productFlag } from '../../../input/product.js';
import { confirmTokenWrite } from '../../../input/virtual-currencies-write.js';
import { currencyIdArg, expectedUpdatedAtFlag } from '../../../input/virtual-currencies.js';
import { renderWrittenCurrency } from '../../../views/virtual-currencies/currencies.js';
import { askWithToken, deleteQuestion, WRITE_HELP } from '../../../views/virtual-currencies/questions.js';

import type { VirtualCurrencyDetail } from '../../../../sdk/adapty/index.js';

export default class VirtualCurrenciesMappingsDelete extends AdaptyCommand {
    static override summary = 'Remove the mapping of one product from a virtual currency';

    static override description = [
        'After it, the purchases of the product stop giving coins of the currency, and no ledger record shows the coins '
        + 'they did not give. The other mappings stay. A product with no mapping fails with 404.',
        'It reads the currency and asks (exit 6 when nobody can answer, with the updated_at of the read). --yes needs '
        + '--expected-updated-at, the updated_at of the read the user saw; the delete fails with 409 when somebody '
        + 'changed the currency after it.',
        WRITE_HELP,
    ].join('\n\n');

    static override examples = [
        '<%= config.bin %> virtual-currencies mappings delete CURRENCY_UUID --app APP_UUID --product PRODUCT_UUID',
        '<%= config.bin %> virtual-currencies mappings delete CURRENCY_UUID --app APP_UUID --product PRODUCT_UUID --yes '
        + '--expected-updated-at 1794219300000',
    ];

    static override args = { ...currencyIdArg };
    static override flags = { ...appIdFlag, ...productFlag, ...expectedUpdatedAtFlag, ...yesFlag };

    async run(): Promise<VirtualCurrencyDetail> {
        const { args, flags } = await this.parse(VirtualCurrenciesMappingsDelete);
        const currencyId = args.virtual_currency_id;

        const token = await confirmTokenWrite({
            interactive: this.interactive,
            question: currency => deleteQuestion(currency, flags.product),
            // the sdk only after the token rules: --yes with no --expected-updated-at is exit 6 even with no login
            read: () => this.adapty.virtualCurrencies.get(flags.app, currencyId),
            refusal: currency => askWithToken(currency.updated_at),
            signal: this.signal,
            token: flags['expected-updated-at'],
            yes: flags.yes,
        });

        const written = { expectedUpdatedAt: token };

        const currency = await this.adapty.virtualCurrencies.mappings
            .delete(flags.app, currencyId, flags.product, written)
            .catch((error: unknown) => {
                throw withWriteHints(error, `adapty virtual-currencies get ${currencyId} --app ${flags.app}`);
            });

        this.render(currency, renderWrittenCurrency(`Mapping of ${flags.product} removed.`));

        return currency;
    }
}
