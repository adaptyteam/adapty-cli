import { Flags } from '@oclif/core';

import { validateCreateApp } from '../../../sdk/adapty/apps/index.js';
import { platforms } from '../../../sdk/adapty/index.js';
import { CancelledError } from '../../../sdk/core/errors.js';
import { assertValid } from '../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../base/adapty/index.js';
import { renderRecord } from '../../views/record.js';

import type { AppSummary, CreateAppInput } from '../../../sdk/adapty/index.js';

export default class AppsCreate extends AdaptyCommand {
    static override description = 'Create a new Adapty app';

    static override examples = [
        '<%= config.bin %> apps create --title "My App" --platform ios --apple-bundle-id com.example.app',
        '<%= config.bin %> apps create --title "My App" --platform ios --platform android --apple-bundle-id com.example.app --google-bundle-id com.example.app',
    ];

    // Input shape here, the rule (a bundle id per platform) in sdk/adapty/apps/create.ts — where a
    // future MCP server obeys it too.
    static override flags = {
        'title': Flags.string({ description: 'App title', required: true }),
        'platform': Flags.option({
            description: 'Platform (ios, android). Repeat for multiple.',
            multiple: true,
            options: platforms,
            required: true,
        })(),
        'apple-bundle-id': Flags.string({ description: 'Apple bundle ID (required with --platform ios)' }),
        'google-bundle-id': Flags.string({ description: 'Google bundle ID (required with --platform android)' }),
    };

    async run(): Promise<AppSummary> {
        const { flags } = await this.parse(AppsCreate);

        const input: CreateAppInput = {
            appleBundleId: flags['apple-bundle-id'],
            googleBundleId: flags['google-bundle-id'],
            platforms: flags.platform,
            title: flags.title,
        };

        assertValid(validateCreateApp(input));

        const app = await this.adapty.apps.create(input);

        this.log('App created!');
        this.render(app, renderRecord);
        await this.showDefaultAccessLevel(app.id);

        return app;
    }

    /**
     * A courtesy for a human reader: the server creates a default access level with the app. Under
     * --json the result is the app itself, so the request is skipped — and a failure to read it
     * never fails the create, which has already happened.
     */
    private async showDefaultAccessLevel(appId: string): Promise<void> {
        if (this.jsonEnabled()) {
            return;
        }

        try {
            const { items } = await this.adapty.accessLevels.list(appId);
            const [first] = items ?? [];

            if (first) {
                this.log('\nDefault access level:');
                this.log(renderRecord(first));
            }
        } catch (error) {
            // Ctrl+C is not a failed request: swallowing it would warn and carry on as if the
            // user had not asked to stop.
            if (error instanceof CancelledError) {
                throw error;
            }

            this.warn('Could not fetch access levels for new app');
        }
    }
}
