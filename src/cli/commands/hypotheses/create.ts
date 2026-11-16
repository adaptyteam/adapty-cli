import { Flags } from '@oclif/core';

import { withHypothesisIds } from '../../../sdk/adapty/index.js';
import { AdaptyCommand } from '../../base/adapty/index.js';
import { withItemPaths } from '../../errors/hypotheses.js';
import { appIdFlag } from '../../input/app.js';
import { readCreateBodies } from '../../input/hypotheses.js';
import { renderCreated } from '../../views/hypotheses.js';

import type { CreatedHypotheses, CreateHypothesesInput, HypothesisCreateBody } from '../../../sdk/adapty/index.js';

type Bodies = readonly HypothesisCreateBody[];

/** In a batch, which item each new id went to. */
const mintedText = (bodies: Bodies, sent: Bodies, minted: readonly string[]): string => {
    if (bodies.length === 1) {
        return minted.join(', ');
    }

    return sent.flatMap((body, index) => (body.hypothesis_id === bodies[index]?.hypothesis_id
        ? []
        : [`item ${String(index + 1)} ${String(body.hypothesis_id)}`])).join(', ');
};

export default class HypothesesCreate extends AdaptyCommand {
    static override description = 'The file holds one create body, an array of them, or {"hypotheses": [...]}, all on one placement; '
        + 'they are created together or not at all. A body needs placement_id, subject ({type: flow, flow_id}, '
        + '{type: flow_screen, flow_id, flow_screen_id} or {type: audience, segment_id}), type (namespace:name) and title; '
        + 'the server refuses a key it does not know. A hypothesis cannot be edited after create: dismiss it and create a new one.\n\n'
        + 'An item without hypothesis_id gets a new one, printed to stderr before the request with its item number in a batch. '
        + 'If the answer is lost, put that id into the body as hypothesis_id and resend: the same payload under the same id returns the stored '
        + 'hypothesis instead of a second one.\n\n'
        + 'An open hypothesis with the same placement, subject and type is refused unless --force; with --force, a rerun '
        + 'of a body without hypothesis_id creates one more copy';

    static override examples = [
        '<%= config.bin %> hypotheses create --app UUID --file hypothesis.json',
        '<%= config.bin %> hypotheses create --app UUID --file - < batch.json',
        '<%= config.bin %> hypotheses create --app UUID --file hypothesis.json --force',
    ];

    static override flags = {
        ...appIdFlag,
        file: Flags.string({ description: 'Path to the JSON file, or - for stdin', required: true }),
        force: Flags.boolean({ description: 'Create even when an open hypothesis has the same placement, subject and type' }),
    };

    static override summary = 'Create hypotheses from a JSON file';

    async run(): Promise<CreatedHypotheses> {
        const { flags } = await this.parse(HypothesesCreate);
        const bodies = await readCreateBodies(flags.file);
        const { hypotheses, minted } = withHypothesisIds(bodies);
        const input: CreateHypothesesInput = { force: flags.force, hypotheses };

        // The token is checked here, so an id is announced only when it is about to be sent
        const { adapty } = this;

        if (minted.length > 0) {
            // Not logToStderr, which oclif silences under --json: a caller that loses the answer needs
            // these ids to resend
            process.stderr.write(`Sending new hypothesis_id: ${mintedText(bodies, hypotheses, minted)}. If the answer is lost, `
                + 'put each into its body as hypothesis_id and resend.\n');
        }

        const created = await adapty.hypotheses.create(flags.app, input).catch((error: unknown) => {
            throw withItemPaths(error, hypotheses.length);
        });

        this.render(created, renderCreated);

        return created;
    }
}
