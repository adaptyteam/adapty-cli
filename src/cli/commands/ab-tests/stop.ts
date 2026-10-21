import { AdaptyCommand } from '../../base/adapty/index.js';
import { abTestIdArg, stopFlags, stopInput } from '../../input/ab-tests.js';
import { appIdFlag } from '../../input/app.js';
import { confirmAction, yesFlag } from '../../input/confirm.js';
import { stopEffect, stoppedLine } from '../../views/ab-tests/effect.js';
import { renderAbTest } from '../../views/ab-tests/record.js';

import type { AbTestDetail } from '../../../sdk/adapty/index.js';

export default class AbTestsStop extends AdaptyCommand {
    static override args = { ...abTestIdArg };

    static override description
        = 'Stop a live A/B test: its audience then shows the winner (an arm), other content, or nothing. '
            + 'The test becomes completed and does not run again unless you start it again. It asks first, or refuses (exit 6) '
            + 'without --yes when nobody can answer';

    static override examples = [
        '<%= config.bin %> ab-tests stop --app APP_UUID TEST_UUID --winner PAYWALL_UUID',
        '<%= config.bin %> ab-tests stop --app APP_UUID TEST_UUID --no-content --yes',
    ];

    static override flags = {
        ...appIdFlag,
        ...stopFlags,
        ...yesFlag,
    };

    async run(): Promise<AbTestDetail> {
        const { args, flags } = await this.parse(AbTestsStop);
        const content = flags.winner ?? flags.other;

        // The read gives the title and the type: the server names the content kind in the field it takes
        const test = await this.adapty.abTests.get(flags.app, args.ab_test_id);

        await confirmAction({
            effect: stopEffect(test, content),
            interactive: this.interactive,
            signal: this.signal,
            yes: flags.yes,
        });

        const stopped = await this.adapty.abTests.stop(flags.app, args.ab_test_id, stopInput(test.type, flags));

        this.log(stoppedLine(stopped, content));
        this.render(stopped, renderAbTest);

        return stopped;
    }
}
