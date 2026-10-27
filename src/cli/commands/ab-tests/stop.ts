import { AdaptyCommand } from '../../base/adapty/index.js';
import { CliError, exitCode } from '../../errors.js';
import { abTestIdArg, stopFlags, stopInput } from '../../input/ab-tests.js';
import { appIdFlag } from '../../input/app.js';
import { confirmAction, yesFlag } from '../../input/confirm.js';
import { stopEffect, stoppedLine } from '../../views/ab-tests/effect.js';
import { renderAbTest } from '../../views/ab-tests/record.js';

import type { AbTestDetail } from '../../../sdk/adapty/index.js';

const NO_CONTENT_ON_ALL_USERS = 'AB Test from default audience can not be stopped.';

export default class AbTestsStop extends AdaptyCommand {
    static override args = { ...abTestIdArg };
    static override description = 'Stop a live A/B test: its audience shows the winner, other content or nothing (--no-content is refused on All users); it asks first';

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

        // The read gives the title and the type: the server names the content kind in the field it takes
        const test = await this.adapty.abTests.get(flags.app, args.ab_test_id);

        // All users cannot be left with nothing: refuse here, before the question, as the server would
        if (flags['no-content'] && test.segment_ids?.length === 0) {
            throw new CliError(NO_CONTENT_ON_ALL_USERS, exitCode.api, 'validation_error', {
                json: { error_code: 'validation_error', message: NO_CONTENT_ON_ALL_USERS },
            });
        }

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
