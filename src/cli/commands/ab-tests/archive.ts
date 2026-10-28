import { AdaptyCommand } from '../../base/adapty/index.js';
import { abTestIdArg } from '../../input/ab-tests.js';
import { appIdFlag } from '../../input/app.js';
import { confirmAction, yesFlag } from '../../input/confirm.js';
import { archiveEffect, archivedLine } from '../../views/ab-tests/effect.js';
import { renderAbTest } from '../../views/ab-tests/record.js';

import type { AbTestDetail } from '../../../sdk/adapty/index.js';

export default class AbTestsArchive extends AdaptyCommand {
    static override args = { ...abTestIdArg };

    static override description = 'Archive an A/B test that does not run (an archived test gives an error); it cannot be unarchived, so it asks first';

    static override examples = [
        '<%= config.bin %> ab-tests archive --app UUID TEST_ID',
        '<%= config.bin %> ab-tests archive --app UUID TEST_ID --yes',
    ];

    static override flags = {
        ...appIdFlag,
        ...yesFlag,
    };

    async run(): Promise<AbTestDetail> {
        const { args, flags } = await this.parse(AbTestsArchive);

        const test = await this.adapty.abTests.get(flags.app, args.ab_test_id);

        await confirmAction({
            effect: archiveEffect(test),
            interactive: this.interactive,
            signal: this.signal,
            yes: flags.yes,
        });

        const archived = await this.adapty.abTests.archive(flags.app, args.ab_test_id);

        this.log(archivedLine(archived));
        this.render(archived, renderAbTest);

        return archived;
    }
}
