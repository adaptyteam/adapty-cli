import { validateMappingItems } from '../../../../sdk/adapty/virtual-currencies/index.js';
import { assertValid } from '../../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../../base/adapty/index.js';
import { withWriteHints } from '../../../errors/virtual-currencies.js';
import { appIdFlag } from '../../../input/app.js';
import { yesFlag } from '../../../input/confirm.js';
import { readJsonFile } from '../../../input/json.js';
import { confirmTokenWrite } from '../../../input/virtual-currencies-write.js';
import { currencyIdArg, expectedUpdatedAtFlag, mappingsFileFlag } from '../../../input/virtual-currencies.js';
import { renderUpserted } from '../../../views/virtual-currencies/currencies.js';
import { askWithToken, MAPPING_HELP, upsertQuestion, WRITE_HELP } from '../../../views/virtual-currencies/questions.js';

import type { MappingItem, UpsertedMappings } from '../../../../sdk/adapty/index.js';

export default class VirtualCurrenciesMappingsUpsert extends AdaptyCommand {
    static override summary = 'Add or change the product mappings of a virtual currency';

    static override description = [
        'Each item of --file is the full mapping of one product: a product with a mapping gets the new one, a product '
        + 'with none gets one; the mappings of other products stay. Each later purchase gives the new coins.',
        MAPPING_HELP,
        'It reads the currency and asks with each product as new or old → new (exit 6 when nobody can answer, with '
        + 'the updated_at of the read). --yes needs --expected-updated-at, the updated_at of the read the user saw; the '
        + 'write fails with 409 when somebody changed the currency after it.',
        WRITE_HELP,
    ].join('\n\n');

    static override examples = [
        '<%= config.bin %> virtual-currencies mappings upsert CURRENCY_UUID --app APP_UUID --file mappings.json',
        '<%= config.bin %> virtual-currencies mappings upsert CURRENCY_UUID --app APP_UUID --file mappings.json --yes '
        + '--expected-updated-at 1794219300000',
    ];

    static override args = { ...currencyIdArg };
    static override flags = { ...appIdFlag, ...mappingsFileFlag, ...expectedUpdatedAtFlag, ...yesFlag };

    async run(): Promise<UpsertedMappings> {
        const { args, flags } = await this.parse(VirtualCurrenciesMappingsUpsert);
        const items = await readJsonFile(flags.file);

        assertValid(validateMappingItems(items));

        const mappings = items as MappingItem[];
        const currencies = this.adapty.virtualCurrencies;
        const currencyId = args.virtual_currency_id;

        const token = await confirmTokenWrite({
            interactive: this.interactive,
            question: currency => upsertQuestion(currency, mappings),
            read: () => currencies.get(flags.app, currencyId),
            refusal: currency => askWithToken(currency.updated_at),
            signal: this.signal,
            token: flags['expected-updated-at'],
            yes: flags.yes,
        });

        const answer = await currencies.mappings.upsert(flags.app, currencyId, mappings, { expectedUpdatedAt: token })
            .catch((error: unknown) => {
                throw withWriteHints(error, `adapty virtual-currencies get ${currencyId} --app ${flags.app}`);
            });

        this.render(answer, renderUpserted);

        return answer;
    }
}
