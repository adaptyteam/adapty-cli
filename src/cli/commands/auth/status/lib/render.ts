import type { Result } from './result.js';

/** Private to `auth status`: the moment a second command needs this, it belongs in cli/views. */
export const renderStatus = (status: Result): string => {
    if (!status.authenticated) {
        return 'Not authenticated. Run `adapty auth login`.';
    }

    const lines: string[] = [];

    if (status.email !== undefined) {
        lines.push(`Email: ${status.email}`);
    }

    // A prefix, never the token: this output ends up in logs, screenshots and CI transcripts
    lines.push(`Token: ${status.token_prefix}****`);
    lines.push(status.source === 'env' ? 'Source: ADAPTY_TOKEN (environment)' : `Config: ${status.config_path}`);

    return lines.join('\n');
};
