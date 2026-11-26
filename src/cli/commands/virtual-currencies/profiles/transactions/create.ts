import { randomUUID } from 'node:crypto';

import { Flags } from '@oclif/core';

import { validateProfileAddress } from '../../../../../sdk/adapty/virtual-currencies/index.js';
import { assertValid } from '../../../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../../../base/adapty/index.js';
import { withAdjustmentKey } from '../../../../errors/virtual-currencies.js';
import { appIdFlag } from '../../../../input/app.js';
import { confirmAction, yesFlag } from '../../../../input/confirm.js';
import { idempotencyKeyFlag, profileAddress, profileAddressFlags } from '../../../../input/virtual-currencies.js';
import { renderAdjustment } from '../../../../views/virtual-currencies/ledger.js';
import { adjustmentQuestion, ASK_THE_USER } from '../../../../views/virtual-currencies/questions.js';

import type { AdjustmentInput } from '../../../../../sdk/adapty/index.js';
import type { AdjustmentResult } from '../../../../views/virtual-currencies/ledger.js';

export default class VirtualCurrenciesProfilesTransactionsCreate extends AdaptyCommand {
    static override summary = 'Credit or debit the coins of one profile: a manual balance adjustment';

    static override description = [
        'The profile by --profile or by --customer-user-id, exactly one of them; one profile and one currency for each '
        + 'call. The command asks each time (--yes; exit 6 when nobody can answer, exit 1 on no). --amount must be a '
        + 'whole number (exit 2 otherwise); the other values are sent as given and the server checks them, the amount '
        + 'range too: a credit takes the operation reward, spend_reversal or adjustment, a '
        + 'debit reward_reversal, spend or adjustment; a debit stops at the spendable balance (insufficient_balance).',
        'Each write is sent with an idempotency key: --idempotency-key, else a new UUID v4, printed to stderr before '
        + 'the send and named in the answer and in each failure. For one hour a repeat with the same key gives the '
        + 'answer of the first write and writes nothing, also when the other flags differ. After a lost answer '
        + '(exit 5, or 4 on a 5xx) repeat with the same key, never with a new one.',
    ].join('\n\n');

    static override examples = [
        '<%= config.bin %> virtual-currencies profiles transactions create --app APP_UUID --customer-user-id user-42 '
        + '--currency-code GEMS --direction credit --amount 10 --operation adjustment --feature support',
        '<%= config.bin %> virtual-currencies profiles transactions create --app APP_UUID --profile PROFILE_UUID '
        + '--currency-code GEMS --direction debit --amount 5 --operation adjustment --feature support '
        + '--comment "duplicate reward" --yes --json',
    ];

    static override flags = {
        ...appIdFlag,
        ...profileAddressFlags,
        'currency-code': Flags.string({ description: 'The currency code, as `virtual-currencies list` shows it', required: true }),
        'direction': Flags.string({ description: 'credit (add coins) or debit (take coins)', required: true }),
        'amount': Flags.integer({ description: 'The number of coins, a positive whole number', required: true }),
        'operation': Flags.string({
            description: 'The operation of the ledger row: credit reward, spend_reversal or adjustment; debit '
                + 'reward_reversal, spend or adjustment',
            required: true,
        }),
        'feature': Flags.string({ description: 'The feature of the ledger row, e.g. support', required: true }),
        'reference-id': Flags.string({ description: 'Your reference of the change, kept in the ledger row' }),
        'comment': Flags.string({ description: 'Why the balance changes, kept in the ledger row' }),
        ...idempotencyKeyFlag,
        ...yesFlag,
    };

    async run(): Promise<AdjustmentResult> {
        const { flags } = await this.parse(VirtualCurrenciesProfilesTransactionsCreate);
        const address = profileAddress(flags);

        assertValid(validateProfileAddress(address));

        const input: AdjustmentInput = {
            amount: flags.amount,
            comment: flags.comment,
            currencyCode: flags['currency-code'],
            direction: flags.direction,
            feature: flags.feature,
            operation: flags.operation,
            referenceId: flags['reference-id'],
        };

        await confirmAction({
            effect: `${adjustmentQuestion(address, input)}\n${ASK_THE_USER}`,
            interactive: this.interactive,
            signal: this.signal,
            yes: flags.yes,
        });

        // The token is checked here, so a key is announced only when it is about to be sent
        const { adapty } = this;
        const key = flags['idempotency-key'] ?? randomUUID();

        // Not logToStderr, which oclif silences under --json: a caller that loses the answer needs this key
        process.stderr.write(`Sending with the idempotency key ${key}. If the answer is lost, repeat the same command `
            + `with --idempotency-key ${key} within one hour.\n`);

        const answer = await adapty.virtualCurrencies.profiles.adjust(flags.app, address, input, key)
            .catch((error: unknown) => {
                throw withAdjustmentKey(error, key);
            });

        const result: AdjustmentResult = { ...answer, idempotency_key: key };

        this.render(result, renderAdjustment);

        return result;
    }
}
