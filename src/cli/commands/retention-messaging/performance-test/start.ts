import { AdaptyCommand } from '../../../base/adapty/index.js';
import { appIdFlag } from '../../../input/app.js';

export default class RetentionMessagingPerformanceTestStart extends AdaptyCommand {
    static override summary = 'Start the Apple performance test of Retention Messaging (sandbox)';

    static override description = 'Apple tests how fast Adapty answers in sandbox. The test needs the realtime URL in sandbox. '
        + 'Follow it with `retention-messaging setup-status`: running, then passed or failed. Production needs a passed test.';

    static override examples = ['<%= config.bin %> retention-messaging performance-test start --app UUID'];

    static override flags = { ...appIdFlag };

    async run(): Promise<{ mode: 'sandbox'; started: true }> {
        const { flags } = await this.parse(RetentionMessagingPerformanceTestStart);

        await this.adapty.retentionMessaging.startPerformanceTest(flags.app);

        const result = { mode: 'sandbox' as const, started: true as const };

        this.render(result, () => 'Performance test started in sandbox. Run `adapty retention-messaging setup-status` for its result.');

        return result;
    }
}
