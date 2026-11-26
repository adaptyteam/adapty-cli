import { FontsCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { familyIdArg } from '../../input/fonts.js';
import { renderFamily } from '../../views/fonts.js';

import type { FontFamily } from '../../../sdk/adapty/index.js';

export default class FontsGet extends FontsCommand {
    static override args = { ...familyIdArg };
    static override description = 'Get one custom font family with its faces';
    static override examples = ['<%= config.bin %> fonts get FAMILY_UUID --app UUID'];
    static override flags = { ...appIdFlag };

    async run(): Promise<FontFamily> {
        const { args, flags } = await this.parse(FontsGet);
        const family = await this.adapty.fonts.get(flags.app, args.family_id);

        this.render(family, renderFamily);

        return family;
    }
}
