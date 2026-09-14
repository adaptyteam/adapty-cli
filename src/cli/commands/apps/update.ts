import { Flags } from '@oclif/core';

import { validateUpdateApp } from '../../../sdk/adapty/apps/index.js';
import { assertValid } from '../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdArg } from '../../flags.js';
import { renderRecord } from '../../views/record.js';

import type { AppDetail, UpdateAppInput } from '../../../sdk/adapty/index.js';

export default class AppsUpdate extends AdaptyCommand {
    static override args = { ...appIdArg };
    static override description = 'Update an app';
    static override examples = ['<%= config.bin %> apps update 550e8400-... --title "My App"'];

    // The "at least one field" rule lives in the sdk and is checked before requiring a token.
    static override flags = {
        'title': Flags.string({ description: 'App title' }),
        'apple-bundle-id': Flags.string({ description: 'Apple bundle ID' }),
        'google-bundle-id': Flags.string({ description: 'Google bundle ID' }),
    };

    async run(): Promise<AppDetail> {
        const { args, flags } = await this.parse(AppsUpdate);

        const input: UpdateAppInput = {
            appleBundleId: flags['apple-bundle-id'],
            googleBundleId: flags['google-bundle-id'],
            title: flags.title,
        };

        assertValid(validateUpdateApp(input));

        const app = await this.adapty.apps.update(args.app_id, input);

        this.log('App updated!');
        this.render(app, renderRecord);

        return app;
    }
}
