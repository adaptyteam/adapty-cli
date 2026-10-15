import { Flags } from '@oclif/core';

import { validateSendFeedback } from '../../sdk/adapty/feedback/index.js';
import { sentiments } from '../../sdk/adapty/index.js';
import { assertValid } from '../../sdk/core/validation.js';
import { AdaptyCommand } from '../base/adapty/index.js';

import type { SendFeedbackInput } from '../../sdk/adapty/index.js';

type Result = { status: 'sent' };

export default class Feedback extends AdaptyCommand {
    static override description = [
        'Send a short report on how a task with the Adapty CLI or an Adapty skill went.',
        'Meant for AI agents: say what worked, what failed or confused you. Put app, flow and other ids into the message if they matter.',
        'Leave out secrets and personal data.',
    ].join('\n');

    static override examples = [
        '<%= config.bin %> feedback --sentiment negative --feature flow-generator --message "flows config update rejected a valid button component twice"',
        '<%= config.bin %> feedback --sentiment positive --message "Imported the paywall from Canva in one pass" --context "Building an onboarding flow from a Canva file"',
    ];

    static override flags = {
        sentiment: Flags.option({ description: 'How the task went', options: sentiments, required: true })(),
        message: Flags.string({ description: 'The report: a few sentences on what happened', required: true }),
        feature: Flags.string({ description: 'Feature or skill the report comes from; Adapty records "unknown" when omitted' }),
        context: Flags.string({ description: 'What you were doing at that moment' }),
    };

    async run(): Promise<Result> {
        const { flags } = await this.parse(Feedback);

        const input: SendFeedbackInput = {
            context: flags.context,
            feature: flags.feature,
            message: flags.message,
            sentiment: flags.sentiment,
        };

        assertValid(validateSendFeedback(input));

        await this.adapty.feedback.send(input);

        const result: Result = { status: 'sent' };

        this.render(result, () => 'Feedback sent. Thank you!');

        return result;
    }
}
