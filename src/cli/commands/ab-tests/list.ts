import { Flags } from '@oclif/core';

import { abTestStates, abTestTypes } from '../../../sdk/adapty/index.js';
import { AdaptyCommand } from '../../base/adapty/index.js';
import { placementFlag } from '../../input/ab-tests.js';
import { appIdFlag } from '../../input/app.js';
import { pageParams, paginationFlags } from '../../input/pagination.js';
import { renderAbTestPage } from '../../views/ab-tests/record.js';

import type { AbTestSummary, Paginated } from '../../../sdk/adapty/index.js';

export default class AbTestsList extends AdaptyCommand {
    static override description
        = 'List the regular A/B tests of an app, one type at a time: flow tests by default, paywall tests with --type paywall. '
            + 'All states, in the order live, draft, completed, inactive, archived, unless --state picks one';

    static override examples = [
        '<%= config.bin %> ab-tests list --app APP_UUID',
        '<%= config.bin %> ab-tests list --app APP_UUID --type paywall --state live',
    ];

    static override flags = {
        ...appIdFlag,
        ...paginationFlags,
        ...placementFlag('Only the tests of this placement (ID)'),
        search: Flags.string({ description: 'Only the tests whose title has this text' }),
        state: Flags.option({
            description: 'Only the tests in this state',
            options: abTestStates,
        })(),
        type: Flags.option({
            default: 'flow',
            description: 'Which tests to list: flow tests or paywall tests',
            options: abTestTypes,
        })(),
    };

    async run(): Promise<Paginated<AbTestSummary>> {
        const { flags } = await this.parse(AbTestsList);

        const page = await this.adapty.abTests.list(flags.app, {
            ...pageParams(flags),
            placementId: flags.placement,
            search: flags.search,
            state: flags.state,
            type: flags.type,
        });

        this.render(page, renderAbTestPage);

        return page;
    }
}
