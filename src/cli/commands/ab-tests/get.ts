import { AdaptyCommand } from '../../base/adapty/index.js';
import { abTestIdArg } from '../../input/ab-tests.js';
import { appIdFlag } from '../../input/app.js';
import { renderAbTest } from '../../views/ab-tests/record.js';

import type { AbTestDetail } from '../../../sdk/adapty/index.js';

export default class AbTestsGet extends AdaptyCommand {
    static override args = { ...abTestIdArg };
    static override description = 'Get an A/B test with its arms';
    static override examples = ['<%= config.bin %> ab-tests get --app UUID TEST_ID'];
    static override flags = { ...appIdFlag };

    async run(): Promise<AbTestDetail> {
        const { args, flags } = await this.parse(AbTestsGet);
        const test = await this.adapty.abTests.get(flags.app, args.ab_test_id);

        this.render(test, renderAbTest);

        return test;
    }
}
