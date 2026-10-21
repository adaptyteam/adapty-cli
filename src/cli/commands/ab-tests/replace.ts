import { AdaptyCommand } from '../../base/adapty/index.js';
import { abTestIdArg, abTestWriteFlags, requiredPlacementFlag } from '../../input/ab-tests.js';
import { appIdFlag } from '../../input/app.js';
import { confirmAction, yesFlag } from '../../input/confirm.js';
import { replacedLine, replaceEffect } from '../../views/ab-tests/effect.js';
import { renderAbTest } from '../../views/ab-tests/record.js';

import type { AbTestDetail } from '../../../sdk/adapty/index.js';

export default class AbTestsReplace extends AdaptyCommand {
    static override args = { ...abTestIdArg };

    static override description
        = 'Replace a live A/B test with a changed one (the dashboard calls it "Modify"): the live test stops and becomes completed, '
            + 'and a new test with a new id starts on the same audience with a new draw. It asks first, or refuses (exit 6) '
            + 'without --yes when nobody can answer. To change only the title or goal of a test, use `ab-tests update`';

    static override examples = [
        '<%= config.bin %> ab-tests replace --app APP_UUID TEST_UUID --title "Price test v2" --placement PLACEMENT_UUID --paywalls \'[{"paywall_id":"A","weight":80},{"paywall_id":"B","weight":20}]\'',
    ];

    // No audience flag: the new test takes the audience of the one it replaces
    static override flags = {
        ...appIdFlag,
        ...abTestWriteFlags,
        ...requiredPlacementFlag('Placement of the new test (ID); another placement moves the audience there'),
        ...yesFlag,
    };

    async run(): Promise<AbTestDetail> {
        const { args, flags } = await this.parse(AbTestsReplace);

        const test = await this.adapty.abTests.get(flags.app, args.ab_test_id);

        await confirmAction({
            effect: replaceEffect(test),
            interactive: this.interactive,
            signal: this.signal,
            yes: flags.yes,
        });

        const replacement = await this.adapty.abTests.replace(flags.app, args.ab_test_id, {
            flows: flags.flows,
            goal: flags.goal,
            paywalls: flags.paywalls,
            placementId: flags.placement,
            title: flags.title,
        });

        this.log(replacedLine(args.ab_test_id, replacement));
        this.render(replacement, renderAbTest);

        return replacement;
    }
}
