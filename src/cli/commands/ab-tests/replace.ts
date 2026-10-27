import { validateWrite } from '../../../sdk/adapty/ab-tests/index.js';
import { assertValid } from '../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../base/adapty/index.js';
import { abTestIdArg, abTestWriteFlags, requiredPlacementFlag } from '../../input/ab-tests.js';
import { appIdFlag } from '../../input/app.js';
import { confirmAction, yesFlag } from '../../input/confirm.js';
import { replacedLine, replaceEffect } from '../../views/ab-tests/effect.js';
import { renderAbTest } from '../../views/ab-tests/record.js';

import type { AbTestDetail, AbTestWriteInput } from '../../../sdk/adapty/index.js';

export default class AbTestsReplace extends AdaptyCommand {
    static override args = { ...abTestIdArg };
    static override description = 'Replace a live A/B test with a new one on the same audience ("Modify" in the dashboard); the new test has the same number of variants; it asks first';

    static override examples = [
        '<%= config.bin %> ab-tests replace --app UUID TEST_ID --title "Price test v2" --placement UUID --paywalls \'[{"paywall_id":"A","weight":80},{"paywall_id":"B","weight":20}]\'',
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

        const input: Omit<AbTestWriteInput, 'segmentIds'> = {
            flows: flags.flows,
            goal: flags.goal,
            paywalls: flags.paywalls,
            placementId: flags.placement,
            title: flags.title,
        };

        assertValid(validateWrite(input, { placementRequired: true }));

        const test = await this.adapty.abTests.get(flags.app, args.ab_test_id);

        await confirmAction({
            effect: replaceEffect(test),
            interactive: this.interactive,
            signal: this.signal,
            yes: flags.yes,
        });

        const replacement = await this.adapty.abTests.replace(flags.app, args.ab_test_id, input);

        this.log(replacedLine(args.ab_test_id, replacement));
        this.render(replacement, renderAbTest);

        return replacement;
    }
}
