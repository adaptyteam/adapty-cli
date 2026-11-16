import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { hypothesisIdArg } from '../../input/hypotheses.js';
import { renderHypothesis } from '../../views/hypotheses.js';

import type { Hypothesis } from '../../../sdk/adapty/index.js';

export default class HypothesesGet extends AdaptyCommand {
    static override args = { ...hypothesisIdArg };
    static override description = 'Get a hypothesis: what it proposes, where it stands and the actions it allows now';
    static override examples = ['<%= config.bin %> hypotheses get --app UUID HYPOTHESIS_ID'];
    static override flags = { ...appIdFlag };

    async run(): Promise<Hypothesis> {
        const { args, flags } = await this.parse(HypothesesGet);
        const hypothesis = await this.adapty.hypotheses.get(flags.app, args.hypothesis_id);

        this.render(hypothesis, renderHypothesis);

        return hypothesis;
    }
}
