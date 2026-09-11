import { AdaptyCommand } from '../../base/adapty/index.js';
import { renderRecord } from '../../views/record.js';

/**
 * The pair to `auth status`: that one answers "what is stored", this one "does it still work". The
 * answer is passed through untyped, so a new server field shows up in the output on its own.
 */
export default class AuthWhoami extends AdaptyCommand {
    static override description = 'Show the current user from the server (verifies the token)';
    static override examples = ['<%= config.bin %> auth whoami'];

    async run(): Promise<Record<string, unknown>> {
        await this.parse(AuthWhoami);

        const me = await this.adapty.auth.me();

        this.render(me, renderRecord);

        return me;
    }
}
