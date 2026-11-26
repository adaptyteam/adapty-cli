import { Flags } from '@oclif/core';

import { validateCreateVirtualCurrency } from '../../../sdk/adapty/virtual-currencies/index.js';
import { assertValid } from '../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../base/adapty/index.js';
import { withWriteHints } from '../../errors/virtual-currencies.js';
import { appIdFlag } from '../../input/app.js';
import { confirmAction, yesFlag } from '../../input/confirm.js';
import { readJsonFile } from '../../input/json.js';
import { optionalMappingsFileFlag } from '../../input/virtual-currencies.js';
import { renderWrittenCurrency } from '../../views/virtual-currencies/currencies.js';
import { ASK_THE_USER, createQuestion, MAPPING_HELP, WRITE_HELP } from '../../views/virtual-currencies/questions.js';

import type { CreateVirtualCurrencyInput, MappingItem, VirtualCurrencyDetail } from '../../../sdk/adapty/index.js';

export default class VirtualCurrenciesCreate extends AdaptyCommand {
    static override summary = 'Create a virtual currency, with or without product mappings';

    static override description = [
        'A currency cannot be deleted and its code cannot change, so the command asks each time (--yes; exit 6 when '
        + 'nobody can answer, exit 1 on no). --file holds the product mappings: each later purchase of a mapped product '
        + 'gives its coins.',
        MAPPING_HELP,
        WRITE_HELP,
    ].join('\n\n');

    static override examples = [
        '<%= config.bin %> virtual-currencies create --app APP_UUID --code gems --name Gems',
        '<%= config.bin %> virtual-currencies create --app APP_UUID --code gems --name Gems --file mappings.json --yes',
    ];

    static override flags = {
        ...appIdFlag,
        code: Flags.string({ description: 'Currency code: letters, digits and _, unique in the app; it cannot change', required: true }),
        name: Flags.string({ description: 'Currency name', required: true }),
        description: Flags.string({ description: 'Currency description' }),
        ...optionalMappingsFileFlag,
        ...yesFlag,
    };

    async run(): Promise<VirtualCurrencyDetail> {
        const { flags } = await this.parse(VirtualCurrenciesCreate);

        const input: CreateVirtualCurrencyInput = {
            code: flags.code,
            description: flags.description,
            mappings: flags.file === undefined ? undefined : (await readJsonFile(flags.file)) as MappingItem[],
            name: flags.name,
        };

        assertValid(validateCreateVirtualCurrency(input));

        await confirmAction({
            effect: `${createQuestion(input.code, input.mappings ?? [])}\n${ASK_THE_USER}`,
            interactive: this.interactive,
            signal: this.signal,
            yes: flags.yes,
        });

        const currency = await this.adapty.virtualCurrencies.create(flags.app, input).catch((error: unknown) => {
            throw withWriteHints(error, `adapty virtual-currencies list --app ${flags.app}`);
        });

        this.render(currency, renderWrittenCurrency('Virtual currency created.'));

        return currency;
    }
}
