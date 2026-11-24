import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { pageParams, paginationFlags } from '../../input/pagination.js';
import { renderCurrencyList } from '../../views/virtual-currencies/currencies.js';

import type { VirtualCurrencyList } from '../../../sdk/adapty/index.js';

export default class VirtualCurrenciesList extends AdaptyCommand {
    static override description = 'List the virtual currencies of an app: code, name and the number of mapped products. '
        + 'Read one currency with `virtual-currencies get` for its mappings';

    static override examples = ['<%= config.bin %> virtual-currencies list --app APP_UUID'];
    static override flags = { ...appIdFlag, ...paginationFlags };

    async run(): Promise<VirtualCurrencyList> {
        const { flags } = await this.parse(VirtualCurrenciesList);
        const page = await this.adapty.virtualCurrencies.list(flags.app, pageParams(flags));

        this.render(page, renderCurrencyList);

        return page;
    }
}
