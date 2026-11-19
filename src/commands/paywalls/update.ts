import { Args, Command, Flags } from '@oclif/core';

import { appIdFlag } from '../../cli/input/app.js';
import { readBodyFile } from '../../cli/input/json.js';
import { paywallFieldFlags, paywallFieldsFromFlags, PRODUCT_ID_DEPRECATION, requirePaywallFields } from '../../cli/input/paywall.js';
import { createAuthenticatedClient } from '../../lib/client-from-config.js';
import { isValidUuid } from '../../lib/flags.js';
import { printResponse } from '../../lib/output.js';

import type { PaywallDTO } from '../../lib/api-schemas.js';

const FIELD_FLAGS = ['title', ...Object.keys(paywallFieldFlags)];

export default class PaywallsUpdate extends Command {
    static override args = {
        paywall_id: Args.string({ description: 'Paywall ID (UUID)', required: true }),
    };

    static override summary = 'Replace a paywall: every field is required, and a field that is not sent is refused, not reset.';
    static override description = [
        'Send the body of `paywalls get --json` with --file, or give one flag for each field.',
        '',
        'Each paywall has a read-only `kind`: `custom` when it uses no legacy Paywall Builder, `legacy_builder` when it is set to use one.',
        '`kind` follows the builder setting, not a saved layout, and names no builder version.',
        '`paywalls placements` gives the placements that use a paywall now; `paywalls metrics get` gives its traffic in a period, by paywall ID and date.',
        '',
        'An update cannot set `kind`: the server ignores it in --file.',
        'An update sets the older builder flag to false, so a paywall with only the older builder flag shows `kind: custom` after an update.',
    ].join('\n');

    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> paywalls get --app UUID 550e8400-... --json > paywall.json',
        '<%= config.bin %> paywalls update --app UUID 550e8400-... --file paywall.json',
        '<%= config.bin %> paywalls update --app UUID 550e8400-... --title "Default Paywall" '
        + '--products \'[{"product_id":"UUID1"}]\' --remote-configs \'[{"locale":"en","data":"{}"}]\' --use-paywall-builder-v4 --screenshot-id null '
        + '--builder-screenshot-id null --web-purchase-url null',
    ];

    static override flags = {
        ...appIdFlag,
        ...paywallFieldFlags,
        file: Flags.string({
            description: 'JSON file with the whole body, or - to read stdin. `id` and `kind` in it are ignored.',
            exclusive: FIELD_FLAGS,
        }),
        title: Flags.string({ description: 'Paywall title' }),
    };

    async run(): Promise<PaywallDTO> {
        const { args, flags } = await this.parse(PaywallsUpdate);

        if (!isValidUuid(args.paywall_id)) {
            this.error('Invalid paywall ID format.', { exit: 2 });
        }

        // oclif drops its own deprecation warning under --json
        if (this.jsonEnabled() && flags['product-id'] !== undefined) {
            process.stderr.write(`Warning: ${PRODUCT_ID_DEPRECATION}\n`);
        }

        let body: Record<string, unknown>;

        if (flags.file === undefined) {
            body = paywallFieldsFromFlags(flags);
            requirePaywallFields(body);
        } else {
            body = await readBodyFile(flags.file);
        }

        const client = await createAuthenticatedClient(this.config);

        const result = await client.put<PaywallDTO>(`/apps/${flags.app}/paywalls/${args.paywall_id}`, body);

        this.log('Paywall updated!');
        printResponse(result, this.log.bind(this));

        return result;
    }
}
