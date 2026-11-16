import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { hypothesisIdArg } from '../../input/hypotheses.js';
import { renderHypothesis } from '../../views/hypotheses.js';

import type { Hypothesis } from '../../../sdk/adapty/index.js';

export default class HypothesesUnlink extends AdaptyCommand {
    static override args = { ...hypothesisIdArg };
    static override description = 'Unlink the A/B test from a hypothesis whose test has not started; the variant stays';
    static override examples = ['<%= config.bin %> hypotheses unlink --app UUID HYPOTHESIS_ID'];
    static override flags = { ...appIdFlag };

    async run(): Promise<Hypothesis> {
        const { args, flags } = await this.parse(HypothesesUnlink);
        const hypothesis = await this.adapty.hypotheses.act(flags.app, args.hypothesis_id, 'unlink');

        this.render(hypothesis, renderHypothesis);

        return hypothesis;
    }
}
