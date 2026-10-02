import { createHash } from 'node:crypto';

import { CliError, exitCode } from '../../errors.js';

export type MigrationContext = {
    version: 1;
    tokenFingerprint: string;
    currentMigrationId: string;
};

export type MigrationSession = { token?: string | undefined };

export const migrationTokenFingerprint = (token: string): string => {
    return createHash('sha256').update(token).digest('hex');
};

export const validateMigrationId = (id: string): string => {
    if (id.trim() === '') {
        throw new CliError('Migration ID must not be empty or whitespace.', exitCode.usage, 'migration_required');
    }

    return id;
};

export const createMigrationContext = (
    session: MigrationSession & { token: string },
    currentMigrationId: string,
): MigrationContext => ({
    version: 1,
    tokenFingerprint: migrationTokenFingerprint(session.token),
    currentMigrationId: validateMigrationId(currentMigrationId),
});

const isNonBlankString = (value: unknown): value is string => {
    return typeof value === 'string' && value.trim() !== '';
};

const SHA256_HEX = /^[a-f0-9]{64}$/;

export const isMigrationContext = (value: unknown): value is MigrationContext => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }

    const record = value as Record<string, unknown>;

    return record.version === 1
        && typeof record.tokenFingerprint === 'string'
        && SHA256_HEX.test(record.tokenFingerprint)
        && isNonBlankString(record.currentMigrationId);
};
