import type { Issue } from '../../core/errors.js';

/** The main flow creates the Adapty app; other flows require an existing app. */
const MAIN_FLOW = 'main';

/** Keep fields optional so incomplete input produces a validation error. */
export type CreateMigrationInput = {
    appId?: string | undefined;
    appName?: string | undefined;
    flow?: string | undefined;
};

type CreateMigrationRequest = {
    app_id?: string;
    app_name?: string;
    flow: string;
};

/** Accept either a new app name or an existing app ID with a flow. Issue paths identify CLI flags. */
export const validateCreateMigration = (input: CreateMigrationInput): Issue[] => {
    const { appId, appName, flow } = input;

    if (appName === undefined && flow === undefined && appId === undefined) {
        return [{ message: 'pass --name to migrate into a new app, or --flow with --app for an existing one' }];
    }

    const issues: Issue[] = [];

    if (appName !== undefined) {
        if (appName.trim() === '') {
            issues.push({ message: 'must not be empty', path: 'name' });
        }

        if (flow !== undefined || appId !== undefined) {
            issues.push({ message: 'starts the main flow and names the app it creates: --flow and --app do not apply', path: 'name' });
        }

        return issues;
    }

    if (flow === undefined) {
        issues.push({ message: 'required unless --name is given', path: 'flow' });
    } else if (flow.trim() === '') {
        issues.push({ message: 'must not be empty', path: 'flow' });
    }

    if (appId === undefined) {
        issues.push({ message: 'required with --flow: the app the flow runs for', path: 'app' });
    }

    return issues;
};

export const toCreateRequest = (input: CreateMigrationInput): CreateMigrationRequest => {
    const { appId, appName, flow } = input;

    if (appName !== undefined) {
        return { app_name: appName, flow: MAIN_FLOW };
    }

    if (appId === undefined || flow === undefined) {
        // The resource validates first; reaching this branch means a caller skipped validation.
        throw new Error('createMigration needs either appName, or appId with flow');
    }

    return { app_id: appId, flow };
};
