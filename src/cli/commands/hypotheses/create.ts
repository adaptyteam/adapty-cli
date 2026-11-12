import { Flags } from '@oclif/core';

import { validateCreate, withHypothesisIds } from '../../../sdk/adapty/index.js';
import { assertValid } from '../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { readCreateBodies } from '../../input/hypotheses.js';
import { renderCreated } from '../../views/hypotheses.js';

import type { CreatedHypotheses, CreateHypothesesInput } from '../../../sdk/adapty/index.js';

export default class HypothesesCreate extends AdaptyCommand {
    static override description = 'Create hypotheses from a JSON file: one create body, an array of them, or {"hypotheses": [...]}, '
        + 'all on one placement. A body needs placement_id, subject ({type: flow, flow_id}, {type: flow_screen, flow_id, flow_screen_id} '
        + 'or {type: audience, segment_id}), type (namespace:name) and title; the server refuses a key it does not know. '
        + 'They are created together or not at all. An item without hypothesis_id gets a new one, '
        + 'printed to stderr: resending the same payload with the same id returns the stored hypothesis instead of a second one';

    static override examples = [
        '<%= config.bin %> hypotheses create --app UUID --file hypothesis.json',
        'cat batch.json | <%= config.bin %> hypotheses create --app UUID --file -',
        '<%= config.bin %> hypotheses create --app UUID --file hypothesis.json --force',
    ];

    static override flags = {
        ...appIdFlag,
        file: Flags.string({ description: 'Path to the JSON file, or - for stdin', required: true }),
        force: Flags.boolean({ description: 'Create even when an open hypothesis already proposes the same change' }),
    };

    async run(): Promise<CreatedHypotheses> {
        const { flags } = await this.parse(HypothesesCreate);
        const { hypotheses, minted } = withHypothesisIds(await readCreateBodies(flags.file));
        const input: CreateHypothesesInput = { force: flags.force, hypotheses };

        assertValid(validateCreate(input));

        // The token is checked here, so an id is announced only when it is about to be sent
        const { adapty } = this;

        if (minted.length > 0) {
            // Not logToStderr, which oclif silences under --json: a caller that loses the answer needs
            // these ids to resend
            process.stderr.write(`New hypothesis_id: ${minted.join(', ')}\n`);
        }

        const created = await adapty.hypotheses.create(flags.app, input);

        this.render(created, renderCreated);

        return created;
    }
}
