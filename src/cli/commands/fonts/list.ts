import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { renderFamilyList } from '../../views/fonts.js';

import type { FontFamilyList } from '../../../sdk/adapty/index.js';

export default class FontsList extends AdaptyCommand {
    static override description = 'List the custom font families of an app with their faces: weight, italic, iOS and Android '
        + 'names, the default face and whether the weight and style are known';

    static override examples = ['<%= config.bin %> fonts list --app UUID'];
    static override flags = { ...appIdFlag };

    async run(): Promise<FontFamilyList> {
        const { flags } = await this.parse(FontsList);
        const list = await this.adapty.fonts.list(flags.app);

        this.render(list, value => renderFamilyList(value.data, flags.app));

        return list;
    }
}
