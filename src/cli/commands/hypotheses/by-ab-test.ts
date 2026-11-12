import { AdaptyCommand } from '../../base/adapty/index.js';
import { abTestIdArg } from '../../input/ab-tests.js';
import { appIdFlag } from '../../input/app.js';
import { renderHypothesisRows } from '../../views/hypotheses.js';

import type { HypothesisRows } from '../../../sdk/adapty/index.js';

export default class HypothesesByAbTest extends AdaptyCommand {
    static override args = { ...abTestIdArg };
    static override description = 'Get the hypotheses an A/B test is linked to; a test linked to none is a hypothesis_not_found error';
    static override examples = ['<%= config.bin %> hypotheses by-ab-test --app UUID AB_TEST_ID'];
    static override flags = { ...appIdFlag };

    async run(): Promise<HypothesisRows> {
        const { args, flags } = await this.parse(HypothesesByAbTest);
        const rows = await this.adapty.hypotheses.byAbTest(flags.app, args.ab_test_id);

        this.render(rows, renderHypothesisRows);

        return rows;
    }
}
