import { Flags } from '@oclif/core';

import { abTestStates, abTestTypes } from '../../../sdk/adapty/index.js';
import { AdaptyCommand } from '../../base/adapty/index.js';
import { listFilterFlags } from '../../input/ab-tests.js';
import { appIdFlag } from '../../input/app.js';
import { pageParams, paginationFlags } from '../../input/pagination.js';
import { renderAbTestPage } from '../../views/ab-tests/record.js';

import type { AbTestSummary, Paginated } from '../../../sdk/adapty/index.js';

export default class AbTestsList extends AdaptyCommand {
    static override description = 'List the A/B tests of an app, flow tests by default (--type paywall for paywall tests)';

    static override examples = [
        '<%= config.bin %> ab-tests list --app UUID',
        '<%= config.bin %> ab-tests list --app UUID --type paywall --state live',
        '<%= config.bin %> ab-tests list --app UUID --placement UUID --placement UUID --segment UUID',
    ];

    static override flags = {
        ...appIdFlag,
        ...paginationFlags,
        ...listFilterFlags,
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
            placementIds: flags.placement,
            search: flags.search,
            segmentIds: flags.segment,
            state: flags.state,
            type: flags.type,
        });

        this.render(page, renderAbTestPage);

        return page;
    }
}
