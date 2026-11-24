import { Flags } from '@oclif/core';

import { validateUpdateVirtualCurrency } from '../../../sdk/adapty/virtual-currencies/index.js';
import { assertValid } from '../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../base/adapty/index.js';
import { withWriteHints } from '../../errors/virtual-currencies.js';
import { appIdFlag } from '../../input/app.js';
import { currencyIdArg } from '../../input/virtual-currencies.js';
import { renderWrittenCurrency } from '../../views/virtual-currencies/currencies.js';
import { WRITE_HELP } from '../../views/virtual-currencies/questions.js';

import type { UpdateVirtualCurrencyInput, VirtualCurrencyDetail } from '../../../sdk/adapty/index.js';

export default class VirtualCurrenciesUpdate extends AdaptyCommand {
    static override summary = 'Change the name or the description of a virtual currency';

    static override description = [
        'Reads the currency and writes both fields: a field you leave out keeps its value, and a change made by somebody '
        + 'after the read fails with 409 instead of being overwritten. The code and the mappings do not change here. '
        + 'It does not ask: a name or a description is undone by another update.',
        WRITE_HELP,
    ].join('\n\n');

    static override examples = [
        '<%= config.bin %> virtual-currencies update CURRENCY_UUID --app APP_UUID --name "Gold gems"',
        '<%= config.bin %> virtual-currencies update CURRENCY_UUID --app APP_UUID --clear-description',
    ];

    static override args = { ...currencyIdArg };

    static override flags = {
        ...appIdFlag,
        'name': Flags.string({ description: 'Currency name' }),
        'description': Flags.string({ description: 'Currency description', exclusive: ['clear-description'] }),
        'clear-description': Flags.boolean({ description: 'Remove the description' }),
    };

    async run(): Promise<VirtualCurrencyDetail> {
        const { args, flags } = await this.parse(VirtualCurrenciesUpdate);

        const input: UpdateVirtualCurrencyInput = {
            description: flags['clear-description'] ? null : flags.description,
            name: flags.name,
        };

        assertValid(validateUpdateVirtualCurrency(input));

        const currencies = this.adapty.virtualCurrencies;
        const stored = await currencies.get(flags.app, args.virtual_currency_id);
        const read = `adapty virtual-currencies get ${args.virtual_currency_id} --app ${flags.app}`;

        const currency = await currencies.update(flags.app, stored, input).catch((error: unknown) => {
            throw withWriteHints(error, read, 'then run this update again: it reads the currency again and sends its new '
                + 'updated_at');
        });

        this.render(currency, renderWrittenCurrency('Virtual currency updated.'));

        return currency;
    }
}
