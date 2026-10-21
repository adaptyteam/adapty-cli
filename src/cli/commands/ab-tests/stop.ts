import { validateStop } from '../../../sdk/adapty/ab-tests/index.js';
import { assertValid } from '../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../base/adapty/index.js';
import { abTestIdArg, stopFlags, stopInput } from '../../input/ab-tests.js';
import { appIdFlag } from '../../input/app.js';
import { confirmAction, yesFlag } from '../../input/confirm.js';
import { stopEffect, stoppedLine } from '../../views/ab-tests/effect.js';
import { renderAbTest } from '../../views/ab-tests/record.js';

import type { AbTestDetail } from '../../../sdk/adapty/index.js';

export default class AbTestsStop extends AdaptyCommand {
    static override args = { ...abTestIdArg };
    static override description = 'Stop a live A/B test: its audience shows the winner, other content or nothing; it asks first';

    static override examples = [
        '<%= config.bin %> ab-tests stop --app UUID TEST_ID --winner UUID',
        '<%= config.bin %> ab-tests stop --app UUID TEST_ID --no-content --yes',
    ];

    static override flags = {
        ...appIdFlag,
        ...stopFlags,
        ...yesFlag,
    };

    async run(): Promise<AbTestDetail> {
        const { args, flags } = await this.parse(AbTestsStop);
        const content = flags.winner ?? flags.other;

        // The rule counts the fields and does not depend on the type, which is known only after the read
        assertValid(validateStop(stopInput('paywall', flags)));

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
