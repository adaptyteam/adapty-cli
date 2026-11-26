import { Command, Flags } from '@oclif/core';

import { asaWrite, createAsaClient, noteReplay } from '../../../lib/asa-client.js';
import { idempotencyFlags, positiveDecimalFlag } from '../../../lib/asa-flags.js';
import { confirmFlags, confirmMutation } from '../../../lib/confirm.js';
import { isValidUuid } from '../../../lib/flags.js';
import { printResponse } from '../../../lib/output.js';

import type { AsaKeywordAutopilotEnrollmentDTO } from '../../../lib/asa-schemas.js';

const COUNTRY_REGEX = /^[a-z]{2}$/i;

export default class AsaKeywordAutopilotEnroll extends Command {
    static override description
        = 'Enroll an Apple Ads keyword into the keyword autopilot, which then manages its bid and can pause it';

    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> asa keyword-autopilot enroll --targeting-keyword UUID --target-cpp 12.50',
        '<%= config.bin %> asa keyword-autopilot enroll --targeting-keyword UUID --target-cpp 12.50 --cap 3 --country US --yes',
    ];

    static override flags = {
        ...confirmFlags,
        ...idempotencyFlags,
        'aggressiveness': positiveDecimalFlag(
            'Multiplier of the bid cap the autopilot computes (server default 1.0); it has no effect when --cap is given',
        ),
        'cap': positiveDecimalFlag(
            'Bid cap, used as given instead of the computed one; it limits raises while the keyword ramps and is tested, and a working keyword may be bid above it',
        ),
        'country': Flags.string({
            description: 'Two-letter country code; needed when the keyword campaign targets more than one country',
            parse: input => Promise.resolve(input).then((value) => {
                if (!COUNTRY_REGEX.test(value)) {
                    throw new Error('Country must be a two-letter code, e.g. US.');
                }

                return value.toUpperCase();
            }),
        }),
        'target-cpp': positiveDecimalFlag(
            'Target cost per paying user, in the currency of your Apple Ads account (the currency of the keyword\'s bid; nothing is converted); it is the autopilot\'s target_cpp, not a custom product page',
            { required: true },
        ),
        'targeting-keyword': Flags.string({
            description: 'Apple Ads keyword to enroll (UUID, the internal_id printed by asa keywords list, not the autopilot keyword ID)',
            required: true,
        }),
    };

    async run(): Promise<AsaKeywordAutopilotEnrollmentDTO> {
        const { flags } = await this.parse(AsaKeywordAutopilotEnroll);

        if (!isValidUuid(flags['targeting-keyword'])) {
            this.error('Invalid targeting keyword ID format. Run `adapty asa keywords list` to find it.', { exit: 2 });
        }

        const body = {
            targeting_keyword_internal_id: flags['targeting-keyword'],
            target_cpp: flags['target-cpp'],
            ...(flags.cap === undefined ? {} : { cap: flags.cap }),
            ...(flags.country === undefined ? {} : { country: flags.country }),
            ...(flags.aggressiveness === undefined ? {} : { aggressiveness: flags.aggressiveness }),
        };

        await confirmMutation(
            this,
            {
                body,
                method: 'POST',
                path: '/keyword-autopilot/keywords/',
                summary: 'Enroll the keyword into the keyword autopilot: it manages the keyword\'s bid and can pause the keyword in Apple Ads',
            },
            flags.yes,
        );

        const client = await createAsaClient(this);

        const { replayed, result } = await asaWrite<AsaKeywordAutopilotEnrollmentDTO>(
            client,
            'post',
            '/keyword-autopilot/keywords',
            { body, idempotencyKey: flags['idempotency-key'] },
        );

        noteReplay(replayed, this.log.bind(this));

        if (!replayed) {
            this.log('Keyword enrolled.');
        }

        printResponse(result, this.log.bind(this));

        return result;
    }
}
