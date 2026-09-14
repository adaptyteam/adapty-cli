import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdArg } from '../../flags.js';
import { renderRecord } from '../../views/record.js';

import type { AppDetail } from '../../../sdk/adapty/index.js';

export default class AppsGet extends AdaptyCommand {
    static override args = { ...appIdArg };
    static override description = 'Get app details';
    static override examples = ['<%= config.bin %> apps get 550e8400-e29b-41d4-a716-446655440000'];

    async run(): Promise<AppDetail> {
        const { args } = await this.parse(AppsGet);
        const app = await this.adapty.apps.get(args.app_id);

        this.render(app, renderRecord);

        return app;
    }
}
