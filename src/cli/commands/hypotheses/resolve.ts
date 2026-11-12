import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { hypothesisIdArg, resultFlag } from '../../input/hypotheses.js';
import { renderHypothesis } from '../../views/hypotheses.js';

import type { Hypothesis } from '../../../sdk/adapty/index.js';

export default class HypothesesResolve extends AdaptyCommand {
    static override args = { ...hypothesisIdArg };
    static override description = 'Give the verdict on an accepted, ended or applied hypothesis; it is final';
    static override examples = ['<%= config.bin %> hypotheses resolve --app UUID HYPOTHESIS_ID --result won'];
    static override flags = { ...appIdFlag, ...resultFlag };

    async run(): Promise<Hypothesis> {
        const { args, flags } = await this.parse(HypothesesResolve);
        const hypothesis = await this.adapty.hypotheses.resolve(flags.app, args.hypothesis_id, flags.result);

        this.render(hypothesis, renderHypothesis);

        return hypothesis;
    }
}
