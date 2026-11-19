import { Flags } from '@oclif/core';

import { AdaptyCommand } from '../../../base/adapty/index.js';
import { CliError, exitCode } from '../../../errors.js';
import { appIdFlag } from '../../../input/app.js';
import { canAsk, confirmAction, yesFlag } from '../../../input/confirm.js';
import { modeFlag } from '../../../input/retention-messaging.js';
import { ASK_THE_USER } from '../../../views/retention-messaging.js';

import type { RetentionMode } from '../../../../sdk/adapty/retention-messaging/index.js';

const effectOf = (mode: RetentionMode): string => `Set the Adapty realtime URL in Apple for ${mode}. Apple then sends the `
    + `cancel-screen requests of this app in ${mode} to Adapty.${mode === 'sandbox' ? ' In sandbox Adapty also creates a hidden test message.' : ''}`;

const warningOf = (mode: RetentionMode): string => `Warning: in ${mode}, Apple now has the realtime URL of another server. `
    + 'It will be replaced with the Adapty URL, and that server stops getting the Apple requests of the cancel screen.';

export default class RetentionMessagingRealtimeUrlConfigure extends AdaptyCommand {
    static override summary = 'Set the Adapty realtime URL in Apple for one mode';

    static override description = 'Reads the setup status first. When Apple has the URL of another server in that mode, '
        + 'the CLI warns that it will be replaced: in a terminal it asks, also with --yes; with no terminal (a pipe, --json) it '
        + 'sends nothing and exits 6 unless --replace-other-url is given. Otherwise it asks before the write (--yes; exit 6 '
        + 'when nobody can answer). Production needs a passed performance test.';

    static override examples = [
        '<%= config.bin %> retention-messaging realtime-url configure --app UUID --mode sandbox --yes',
        '<%= config.bin %> retention-messaging realtime-url configure --app UUID --mode production --replace-other-url --yes',
    ];

    static override flags = {
        ...appIdFlag,
        ...modeFlag('The Apple environment to set the URL for'),
        'replace-other-url': Flags.boolean({
            description: 'Replace the URL of another server that Apple has now; give it only after a separate yes to the replacement',
        }),
        ...yesFlag,
    };

    async run(): Promise<{ configured: true; mode: RetentionMode }> {
        const { flags } = await this.parse(RetentionMessagingRealtimeUrlConfigure);
        const status = await this.adapty.retentionMessaging.setupStatus(flags.app);
        const other = status[flags.mode].realtime_url_status === 'configured_to_other_url';
        const effect = effectOf(flags.mode);

        if (other && !flags['replace-other-url']) {
            // --yes is no yes to the replacement: a person sees the warning, a program gets exit 6
            if (!canAsk({ interactive: this.interactive })) {
                throw new CliError(
                    `${warningOf(flags.mode)}\n\nNothing was sent. To replace it, show this to the user, get a separate yes `
                    + 'to the replacement and re-run with --replace-other-url --yes.',
                    exitCode.confirmRequired,
                    'confirm_required',
                );
            }

            await confirmAction({ effect: `${warningOf(flags.mode)}\n${effect}`, interactive: true, signal: this.signal, yes: false });
        } else {
            await confirmAction({
                effect: `${other ? `${warningOf(flags.mode)}\n` : ''}${effect}\n${ASK_THE_USER}`,
                interactive: this.interactive,
                signal: this.signal,
                yes: flags.yes,
            });
        }

        await this.adapty.retentionMessaging.configureRealtimeUrl(flags.app, flags.mode);

        const result = { configured: true as const, mode: flags.mode };

        this.render(result, () => `Realtime URL set in Apple for ${flags.mode}.`);

        return result;
    }
}
