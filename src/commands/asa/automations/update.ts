import { readFile } from 'node:fs/promises';

import { Args, Command, Flags } from '@oclif/core';

import { asaWrite, createAsaClient, noteReplay } from '../../../lib/asa-client.js';
import { addKeywordActionFlags, idempotencyFlags } from '../../../lib/asa-flags.js';
import {

    hasAddKeywordActionFlags,
    rebuildAddKeywordAction,
} from '../../../lib/asa-keyword-action.js';
import { confirmFlags, confirmMutation } from '../../../lib/confirm.js';
import { isValidUuid } from '../../../lib/flags.js';
import { printResponse } from '../../../lib/output.js';

import type { ApiClient } from '../../../lib/api-client.js';
import type { AddKeywordActionFlags } from '../../../lib/asa-keyword-action.js';
import type { AsaAutomationDTO, AsaAutomationMutationDTO } from '../../../lib/asa-schemas.js';

export default class AsaAutomationsUpdate extends Command {
    static override args = {
        automation_id: Args.string({ description: 'Automation rule ID (UUID)', required: true }),
    };

    static override description
        = 'Change an automation rule: stop it, rename it, or replace parts of the rule. An add-as-keyword action flag turns the call into a read-modify-write: the rule is read, actions[0].params is rebuilt from the flags and the whole actions list is written back — an edit someone makes in the dashboard in between is overwritten. This is also the way to repair a rule whose stored params carry the wrong shape.';

    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> asa automations update UUID --stop',
        '<%= config.bin %> asa automations update UUID --file rule.json',
        '<%= config.bin %> asa automations update UUID --target-ad-group AD_GROUP_ID --match-type EXACT --cpt-bid-type search_term_current_cpt',
    ];

    static override flags = {
        ...addKeywordActionFlags,
        ...confirmFlags,
        ...idempotencyFlags,
        file: Flags.string({ description: 'JSON file with the parts to change, or - to read stdin' }),
        name: Flags.string({ description: 'Rule name' }),
        start: Flags.boolean({ description: 'Activate the rule', exclusive: ['stop'] }),
        stop: Flags.boolean({ description: 'Stop the rule and clear its next run', exclusive: ['start'] }),
    };

    async run(): Promise<AsaAutomationMutationDTO> {
        const { args, flags } = await this.parse(AsaAutomationsUpdate);

        if (!isValidUuid(args.automation_id)) {
            this.error('Invalid automation ID format.', { exit: 2 });
        }

        const body: Record<string, unknown> = flags.file ? await this.readRule(flags.file) : {};

        if (flags.name !== undefined) {
            body.name = flags.name;
        }

        if (flags.start) {
            body.status = 1;
        }

        if (flags.stop) {
            body.status = 0;
        }

        const actionFlags = hasAddKeywordActionFlags(flags);

        if (Object.keys(body).length === 0 && !actionFlags) {
            this.error('Nothing to change. Pass --stop, --start, --name, --file or an action flag.', { exit: 2 });
        }

        if ('internal_id' in body) {
            this.error('Remove internal_id from the file: the rule ID comes from the command line.', { exit: 2 });
        }

        const client = await createAsaClient(this.config);

        if (actionFlags) {
            await this.rebuildAction(client, args.automation_id, body, flags);
        }

        await confirmMutation(
            this,
            { body, method: 'PUT', path: `/automations/${args.automation_id}/`, summary: 'Update automation rule' },
            flags.yes,
        );

        const { replayed, result } = await asaWrite<AsaAutomationMutationDTO>(
            client,
            'put',
            `/automations/${args.automation_id}`,
            { body, idempotencyKey: flags['idempotency-key'] },
        );

        noteReplay(replayed, this.log.bind(this));

        if (result.automation && !replayed) {
            this.log('Automation updated!');
        }

        printResponse(result, this.log.bind(this));

        return result;
    }

    private async readRule(path: string): Promise<Record<string, unknown>> {
        let raw: string;

        try {
            raw = path === '-' ? await this.readStdin() : await readFile(path, 'utf8');
        } catch {
            this.error(`Could not read ${path}.`, { exit: 2 });
        }

        try {
            return JSON.parse(raw) as Record<string, unknown>;
        } catch {
            this.error(`${path} is not valid JSON.`, { exit: 2 });
        }
    }

    private async readStdin(): Promise<string> {
        const chunks: Buffer[] = [];

        for await (const chunk of process.stdin) {
            chunks.push(chunk as Buffer);
        }

        return Buffer.concat(chunks).toString('utf8');
    }

    // Read-modify-write: the API replaces `actions` wholesale, so the whole list has to be sent back.
    private async rebuildAction(
        client: ApiClient,
        automationId: string,
        body: Record<string, unknown>,
        flags: AddKeywordActionFlags,
    ): Promise<void> {
        const rule = await client.get<AsaAutomationDTO>(`/automations/${automationId}`);

        try {
            // eslint-disable-next-line @stylistic/max-len -- FIXME if you see this
            body.actions = rebuildAddKeywordAction(body.actions ?? rule.actions, body.operate_with ?? rule.operate_with, flags);
        } catch (error) {
            this.error(error instanceof Error ? error.message : String(error), { exit: 2 });
        }
    }
}
