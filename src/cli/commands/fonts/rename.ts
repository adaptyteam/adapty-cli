import { Args } from '@oclif/core';

import { FontsCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { familyIdArg } from '../../input/fonts.js';
import { renderChangedFamily } from '../../views/fonts.js';

import type { FontFamily } from '../../../sdk/adapty/index.js';
import type { FlowsToPublish } from '../../base/adapty/index.js';

export default class FontsRename extends FontsCommand {
    static override args = {
        ...familyIdArg,
        name: Args.string({ description: 'The new family name', required: true }),
    };

    static override description = 'Rename a font family; its files and faces do not change. Another family of the app '
        + 'may not have the same name; a name that differs only in case is allowed';

    static override examples = ['<%= config.bin %> fonts rename FAMILY_UUID "Brand Sans" --app UUID'];
    static override flags = { ...appIdFlag };

    async run(): Promise<FlowsToPublish & FontFamily> {
        const { args, flags } = await this.parse(FontsRename);
        const family = await this.adapty.fonts.rename(flags.app, args.family_id, args.name);
        const flows = await this.flowsToPublish(flags.app, [family.id]);

        this.render(family, value => renderChangedFamily(value, flows, flags.app));

        return { ...family, flows_to_publish: flows };
    }
}
