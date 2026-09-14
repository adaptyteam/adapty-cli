import type { Issue } from '../../core/errors.js';

/**
 * The flow that starts a migration from scratch: it reads the RevenueCat catalog and creates the
 * Adapty app along the way. Every other flow (transactions, store events) runs for an app this
 * one has already created, which is why only this name is spelled out here.
 */
const MAIN_FLOW = 'main';

/**
 * Permissive on purpose: the two shapes the server accepts are "name a new app" and "a flow for an
 * app that exists", and telling a user which one they half-typed is the rule below, not the type.
 */
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

/**
 * The rule of `create`: exactly one of the two shapes, never a mix. An Issue path names the flag
 * the user typed (src/cli/errors.ts turns `app` into `--app`), and a path is left out when the
 * problem is the input as a whole rather than one field.
 */
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

/** Two bodies, one endpoint. The flow of a new app is not the caller's to choose: it is `main`. */
export const toCreateRequest = (input: CreateMigrationInput): CreateMigrationRequest => {
    const { appId, appName, flow } = input;

    if (appName !== undefined) {
        return { app_name: appName, flow: MAIN_FLOW };
    }

    if (appId === undefined || flow === undefined) {
        // Unreachable through the resource, which validates first: a caller that skipped the rule
        // has a bug, and a bug is not a ValidationError the user could act on.
        throw new Error('createMigration needs either appName, or appId with flow');
    }

    return { app_id: appId, flow };
};
