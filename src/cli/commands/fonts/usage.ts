import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { familyIdArg } from '../../input/fonts.js';
import { renderUsage } from '../../views/fonts.js';

import type { FontFamilyUsage } from '../../../sdk/adapty/index.js';

export default class FontsUsage extends AdaptyCommand {
    static override args = { ...familyIdArg };
    static override description = 'Where a font family is used: the flows (drafts too) and the paywalls of the family, '
        + 'and the paywalls of each face (unknown when they cannot be told apart). A flow is listed when its config names the '
        + 'family by id; a flow that names it only by name is not listed';

    static override examples = ['<%= config.bin %> fonts usage FAMILY_UUID --app UUID'];
    static override flags = { ...appIdFlag };

    async run(): Promise<FontFamilyUsage> {
        const { args, flags } = await this.parse(FontsUsage);
        const usage = await this.adapty.fonts.usage(flags.app, args.family_id);

        this.render(usage, renderUsage);

        return usage;
    }
}
