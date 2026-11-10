import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import { run } from '@oclif/core';
import { captureOutput } from '@oclif/test';
import { expect } from 'chai';

import FlowsVersionsList from '../../src/cli/commands/flows/versions/list.js';
import { exitCode } from '../../src/cli/errors.js';
import { mockFetch, mockFetchSteps, requestOf, restoreFetch, TEST_APP_ID } from '../helpers/mock-fetch.js';

import type * as sinon from 'sinon';

const ROOT = join(import.meta.dirname, '..', '..');
const BASE = 'https://api-admin.adapty.io/api/v1/developer';

/** A line split the way a shell does: single and double quotes both, so `--name ""` is one empty word. */
const words = (line: string): string[] =>
    [...line.matchAll(/'([^']*)'|"([^"]*)"|(\S+)/g)].map(match => match[1] ?? match[2] ?? match[3] ?? '');

const runCommand = (line: string) => captureOutput(async () => run(words(line), { root: ROOT }));

/** Under --json oclif prints the error as JSON and sets the process exit code instead of throwing. */
const runJson = async (line: string): Promise<{ error: Record<string, unknown>; exit: unknown }> => {
    process.exitCode = undefined;

    const { stdout } = await runCommand(line);
    const exit = process.exitCode;

    process.exitCode = undefined;

    return { error: (JSON.parse(stdout) as { error: Record<string, unknown> }).error, exit };
};

const FLOW = '0b0c7e9e-3c06-4f7a-9d7e-2f2f6d3c1b11';
const DRAFT = 'a1a1a1a1-0000-4000-8000-000000000001';
const LIVE = 'a1a1a1a1-0000-4000-8000-000000000002';
const OLD = 'a1a1a1a1-0000-4000-8000-000000000003';
const NEW_FLOW = 'b2b2b2b2-0000-4000-8000-000000000004';
const APP = `--app ${TEST_APP_ID}`;
const PATH = `/apps/${TEST_APP_ID}/flows/${FLOW}`;

/** 2026-11-09 10:15 UTC, the content time of the draft. */
const DRAFT_UPDATED_AT = 1_794_219_300_000;

const row = (fields: Record<string, unknown>) => ({
    created_at: '2026-10-01T09:00:00Z',
    is_current: false,
    last_edited_by: null,
    name: null,
    publication_status: null,
    published_at: null,
    updated_at: 1_759_309_200_000,
    ...fields,
});

const draftRow = (fields: Record<string, unknown> = {}) => row({
    created_at: '2026-11-08T08:00:00Z',
    flow_version_id: DRAFT,
    is_current: true,
    last_edited_by: 'Ann Lee (ann@example.com)',
    state: 'draft',
    title: 'Version 3',
    updated_at: DRAFT_UPDATED_AT,
    version: 2,
    ...fields,
});

const liveRow = row({
    created_at: '2026-10-20T08:00:00Z',
    flow_version_id: LIVE,
    name: 'Black Friday',
    publication_status: 'published',
    published_at: '2026-10-21T12:00:00Z',
    state: 'live',
    title: 'Black Friday',
    version: 1,
});

const oldRow = row({ flow_version_id: OLD, state: 'previous', title: 'Version 1', version: 0 });

const page = (data: unknown[]) => ({ data, meta: { pagination: { count: data.length, page: 1, pages: 1 } } });

const detail = (fields: Record<string, unknown> = {}) => ({
    ...oldRow,
    default_config: { screens: [{ id: 'scr_1' }] },
    layouts: [{ id: 'default' }, { id: 'tablet' }],
    paywalls: [],
    preview_url: `https://mobile-app.adapty.io/flow-preview?app_id=${TEST_APP_ID}&flow_id=${FLOW}&flow_version_id=${OLD}&cluster=us`,
    remote_configs: [],
    ...fields,
});

const methods = (stub: sinon.SinonStub): string[] =>
    stub.getCalls().map(call => (call.args[1] as { method: string }).method);

const bodyOf = (stub: sinon.SinonStub, index: number): unknown => JSON.parse(requestOf(stub, index).body ?? 'null');

const apiError = (status: number, code: string, message: string) =>
    ({ body: { error_code: code, errors: { non_field_errors: [message] }, status_code: status }, status });

/**
 * Whether a person is at a terminal is decided by the real streams, so a test says it for itself. Node deletes
 * isTTY on a pipe rather than setting it false, so the property is put back the way it was found.
 */
const useStreams = ({ terminal, typed }: { terminal: boolean; typed?: string }): (() => void) => {
    const stdout = process.stdout as { isTTY?: boolean | undefined };
    const hadStdout = Object.hasOwn(stdout, 'isTTY');
    const wasTty = stdout.isTTY;
    const stdinDescriptor = Object.getOwnPropertyDescriptor(process, 'stdin');
    const input = Object.assign(new PassThrough(), { isTTY: terminal });

    stdout.isTTY = terminal;
    input.end(typed === undefined ? undefined : `${typed}\n`);
    Object.defineProperty(process, 'stdin', { configurable: true, value: input });

    return () => {
        if (hadStdout) {
            stdout.isTTY = wasTty;
        } else {
            delete stdout.isTTY;
        }

        if (stdinDescriptor) {
            Object.defineProperty(process, 'stdin', stdinDescriptor);
        }
    };
};

const withTerminal = async (typed: string, body: () => Promise<void>): Promise<void> => {
    const restore = useStreams({ terminal: true, typed });

    try {
        await body();
    } finally {
        restore();
    }
};

describe('flows versions', () => {
    let fetchStub: sinon.SinonStub | undefined;
    let restoreStreams: () => void;

    beforeEach(() => {
        process.env.ADAPTY_TOKEN = 'test-token';
        restoreStreams = useStreams({ terminal: false });
    });

    afterEach(() => {
        if (fetchStub) {
            restoreFetch(fetchStub);
            fetchStub = undefined;
        }

        restoreStreams();
        delete process.env.ADAPTY_TOKEN;
    });

    describe('flows versions list', () => {
        it('dates a draft by its creation and an unpublished previous version by its creation; the mark is on the draft only', async () => {
            const failedDraft = draftRow({ publication_status: 'failed', published_at: '2026-11-09T07:00:00Z' });
            const failedPrevious = row({ ...oldRow, publication_status: 'failed' });

            fetchStub = mockFetch([page([failedDraft, liveRow, failedPrevious])]);

            const { stdout } = await runCommand(`flows versions list ${FLOW} ${APP}`);
            const lines = stdout.trim().split('\n');

            expect(lines[0]).to.match(/^Title\s+State\s+Date\s+Version ID\s+Publish$/);
            expect(lines[1]).to.contain('Version 3').and.to.contain('2026-11-08T08:00:00Z').and.to.contain('Publish failed');
            expect(lines[1]).not.to.contain('2026-11-09T07:00:00Z');
            expect(lines[2]).to.contain('Black Friday').and.to.contain('2026-10-21T12:00:00Z');
            expect(lines[3]).to.contain('Version 1').and.to.contain('2026-10-01T09:00:00Z').and.not.to.contain('Publish failed');
            expect(stdout).not.to.contain('History will appear');
        });

        it('marks a draft that publishes', async () => {
            fetchStub = mockFetch([page([draftRow({ publication_status: 'uploading' }), liveRow])]);

            const { stdout } = await runCommand(`flows versions list ${FLOW} ${APP}`);

            expect(stdout.split('\n')[1]).to.contain('Publishing…');
        });

        it('sends --search as filter[search], without the spaces at the ends', async () => {
            fetchStub = mockFetch([page([liveRow])]);

            await runCommand(`flows versions list ${FLOW} ${APP} --search " Friday "`);

            const { url } = requestOf(fetchStub, 0);

            expect(new URL(url).pathname).to.equal(new URL(`${BASE}${PATH}/versions/`).pathname);
            expect(new URL(url).searchParams.get('filter[search]')).to.equal('Friday');
        });

        it('sends no filter and no page size for a search of spaces only', async () => {
            fetchStub = mockFetch([page([liveRow])]);

            await runCommand(`flows versions list ${FLOW} ${APP} --search "   "`);

            expect(new URL(requestOf(fetchStub, 0).url).search).to.equal('');
        });

        it('a never-published flow shows the empty-history text and the draft row under it', async () => {
            fetchStub = mockFetch([page([draftRow()])]);

            const { stdout } = await runCommand(`flows versions list ${FLOW} ${APP}`);
            const lines = stdout.trim().split('\n');

            expect(lines[0]).to.equal('History will appear after the first publish.');
            expect(lines[2]).to.contain('Version 3').and.to.contain(DRAFT);
        });

        it('a flow with no version yet shows only the empty-history text', async () => {
            fetchStub = mockFetch([page([])]);

            const { stdout } = await runCommand(`flows versions list ${FLOW} ${APP}`);

            expect(stdout.trim()).to.equal('History will appear after the first publish.');
        });

        it('a search that matches nothing says so, not that the history is empty', async () => {
            fetchStub = mockFetch([page([])]);

            const { stdout } = await runCommand(`flows versions list ${FLOW} ${APP} --search nothing`);

            expect(stdout.trim()).to.equal('No versions match the search.');
        });

        it('says in its help that it lists every version, with no pages', () => {
            expect(FlowsVersionsList.description).to.contain('List every version of a flow, newest first, in one answer (no pages)');
            expect(Object.keys(FlowsVersionsList.flags)).to.deep.equal(['app', 'search']);
        });

        it('--json gives the API rows unchanged, also for a never-published flow', async () => {
            const answer = page([draftRow()]);

            fetchStub = mockFetch([answer]);

            const { stdout } = await runCommand(`flows versions list ${FLOW} ${APP} --json`);

            expect(JSON.parse(stdout)).to.deep.equal(answer);
        });
    });

    describe('flows versions get', () => {
        let dir: string;

        beforeEach(async () => {
            dir = await mkdtemp(join(tmpdir(), 'flows-versions-'));
        });

        afterEach(async () => {
            await rm(dir, { force: true, recursive: true });
        });

        it('shows the version without its content, with the preview link', async () => {
            fetchStub = mockFetch([detail()]);

            const { stdout } = await runCommand(`flows versions get ${FLOW} ${OLD} ${APP}`);

            expect(requestOf(fetchStub, 0).url).to.equal(`${BASE}${PATH}/versions/${OLD}/`);
            expect(stdout).to.contain('Version 1').and.to.contain(detail().preview_url);
            expect(stdout).not.to.contain('scr_1');
        });

        it('--output writes the version content as JSON', async () => {
            const file = join(dir, 'v.json');

            fetchStub = mockFetch([detail()]);

            const { stdout } = await runCommand(`flows versions get ${FLOW} ${OLD} ${APP} --output ${file}`);

            expect(JSON.parse(await readFile(file, 'utf8'))).to.deep.equal(detail());
            expect(stdout).to.contain(`Wrote version 'Version 1' to ${file}.`).and.not.to.contain('--output');
        });

        it('a file that cannot be written is a clear error, not a raw one', async () => {
            const file = join(dir, 'missing-folder', 'v.json');

            fetchStub = mockFetch([detail()]);

            const { error } = await runCommand(`flows versions get ${FLOW} ${OLD} ${APP} --output ${file}`);

            expect(error?.oclif?.exit).to.equal(1);
            expect(error?.message).to.equal(`Could not write ${file} (ENOENT).`);
        });

        it('does not replace an existing file with --json and no --yes: exit 6, the file stays', async () => {
            const file = join(dir, 'v.json');

            await writeFile(file, 'keep me');
            fetchStub = mockFetch([detail()]);

            const { error, exit } = await runJson(`flows versions get ${FLOW} ${OLD} ${APP} --output ${file} --json`);

            expect(exit).to.equal(exitCode.confirmRequired);
            expect(error.code).to.equal('confirm_required');
            expect(await readFile(file, 'utf8')).to.equal('keep me');
        });

        it('replaces an existing file with --yes', async () => {
            const file = join(dir, 'v.json');

            await writeFile(file, 'old');
            fetchStub = mockFetch([detail()]);

            await runCommand(`flows versions get ${FLOW} ${OLD} ${APP} --output ${file} --yes`);

            expect(JSON.parse(await readFile(file, 'utf8'))).to.deep.equal(detail());
        });
    });

    describe('flows versions preview', () => {
        it('prints the preview_url of the API and nothing else', async () => {
            fetchStub = mockFetch([detail()]);

            const { stdout } = await runCommand(`flows versions preview ${FLOW} ${OLD} ${APP}`);

            expect(stdout.trim()).to.equal(detail().preview_url);
        });
    });

    describe('flows versions rename', () => {
        it('--name "" sends a null name, which gives the "Version N" title again', async () => {
            fetchStub = mockFetch([row({ ...liveRow, name: null, title: 'Version 2' })]);

            const { stdout } = await runCommand(`flows versions rename ${FLOW} ${LIVE} ${APP} --name ""`);

            expect(requestOf(fetchStub, 0).method).to.equal('PATCH');
            expect(requestOf(fetchStub, 0).url).to.equal(`${BASE}${PATH}/versions/${LIVE}/`);
            expect(bodyOf(fetchStub, 0)).to.deep.equal({ name: null });
            expect(stdout).to.contain(`Version ${LIVE} is now 'Version 2'.`);
        });

        it('sends the name as written', async () => {
            fetchStub = mockFetch([liveRow]);

            await runCommand(`flows versions rename ${FLOW} ${LIVE} ${APP} --name "Black Friday"`);

            expect(bodyOf(fetchStub, 0)).to.deep.equal({ name: 'Black Friday' });
        });

        it('shows the archived-flow hint under the server text', async () => {
            fetchStub = mockFetchSteps([apiError(400, 'flow_archived', 'Flow is deleted.')]);

            const { error } = await runCommand(`flows versions rename ${FLOW} ${LIVE} ${APP} --name A`);

            expect(error?.oclif?.exit).to.equal(exitCode.api);
            expect(error?.message).to.equal('Flow is deleted.\nThe flow is archived. Restore it from the archive in the dashboard first.');
        });
    });

    describe('flows versions restore', () => {
        const restore = `flows versions restore ${FLOW} ${OLD} ${APP}`;
        const restored = detail({ flow_version_id: DRAFT, state: 'draft', title: 'Version 3', version: 2 });

        it('with no draft asks nothing and sends {}', async () => {
            fetchStub = mockFetch([page([liveRow, oldRow]), detail({ flow_version_id: DRAFT, state: 'draft', title: 'Version 3' })]);

            const { stdout } = await runCommand(restore);

            expect(methods(fetchStub)).to.deep.equal(['GET', 'POST']);
            expect(requestOf(fetchStub, 1).url).to.equal(`${BASE}${PATH}/versions/${OLD}/restore/`);
            expect(bodyOf(fetchStub, 1)).to.deep.equal({});
            expect(stdout).to.contain('Restored \'Version 1\' as the draft \'Version 3\'');
        });

        it('at a terminal names the draft, its last change and editor, and the version; "n" sends nothing', async () => {
            fetchStub = mockFetch([page([draftRow(), liveRow, oldRow])]);

            await withTerminal('n', async () => {
                const { error, stderr } = await runCommand(restore);

                expect(error?.oclif?.exit).to.equal(1);
                expect(error?.message).to.equal('Cancelled, nothing was sent.');

                expect(stderr).to.contain('Replace the draft \'Version 3\' (last change 2026-11-09 10:15 UTC by Ann Lee (ann@example.com)) '
                    + 'with \'Version 1\'? To keep the draft, duplicate it to a new flow first.');

                expect(stderr).to.contain('Apply? [y/N]');
            });

            expect(methods(fetchStub)).to.deep.equal(['GET']);
        });

        it('at a terminal "y" sends replace_draft with the updated_at of the draft row it read', async () => {
            fetchStub = mockFetch([page([draftRow(), liveRow, oldRow]), restored]);

            await withTerminal('y', async () => {
                await runCommand(restore);
            });

            expect(methods(fetchStub)).to.deep.equal(['GET', 'POST']);
            expect(bodyOf(fetchStub, 1)).to.deep.equal({ expected_updated_at: DRAFT_UPDATED_AT, replace_draft: true });
        });

        it('with --json and no --yes when a draft exists: exit 6 confirm_required, no POST', async () => {
            fetchStub = mockFetch([page([draftRow(), liveRow, oldRow])]);

            const { error, exit } = await runJson(`${restore} --json`);

            expect(exit).to.equal(exitCode.confirmRequired);
            expect(error.code).to.equal('confirm_required');
            expect(error.message).to.contain(`To replace it, re-run with --yes --expected-updated-at ${DRAFT_UPDATED_AT}`);
            expect(error.message).not.to.contain('Re-run with --yes to do it.');
            expect(methods(fetchStub)).to.deep.equal(['GET']);
        });

        it('a version that is not in the list asks nothing and sends {}, so the server says it does not exist', async () => {
            const missing = 'a1a1a1a1-0000-4000-8000-0000000000ff';

            fetchStub = mockFetchSteps([
                { body: page([draftRow(), liveRow, oldRow]) },
                apiError(404, 'flow_version_not_found', 'Flow version does not exist.'),
            ]);

            const { error, exit } = await runJson(`flows versions restore ${FLOW} ${missing} ${APP} --json`);

            expect(exit).to.equal(exitCode.api);
            expect(error.error_code).to.equal('flow_version_not_found');
            expect(bodyOf(fetchStub, 1)).to.deep.equal({});
        });

        it('with --yes and no --expected-updated-at when a draft exists: exit 6, no POST', async () => {
            fetchStub = mockFetch([page([draftRow(), liveRow, oldRow])]);

            const { error } = await runCommand(`${restore} --yes`);

            expect(error?.oclif?.exit).to.equal(exitCode.confirmRequired);
            expect(error?.message).to.equal('--expected-updated-at is required with --yes when the flow has a draft');
            expect(methods(fetchStub)).to.deep.equal(['GET']);
        });

        it('with --yes and --expected-updated-at sends that token', async () => {
            fetchStub = mockFetch([page([draftRow(), liveRow, oldRow]), restored]);

            await runCommand(`${restore} --yes --expected-updated-at 1794219000000`);

            expect(bodyOf(fetchStub, 1)).to.deep.equal({ expected_updated_at: 1_794_219_000_000, replace_draft: true });
        });

        it('a restore of the draft itself asks nothing and leaves the refusal to the server', async () => {
            fetchStub = mockFetchSteps([
                { body: page([draftRow(), liveRow]) },
                apiError(400, 'flow_version_already_draft', 'This flow version is already the current draft.'),
            ]);

            const { error } = await runCommand(`flows versions restore ${FLOW} ${DRAFT} ${APP}`);

            expect(error?.message).to.equal('This flow version is already the current draft.');
            expect(bodyOf(fetchStub, 1)).to.deep.equal({});
        });

        it('a conflict shows the API message and says to list the versions again', async () => {
            const message = 'This flow configuration was already updated by Bob (bob@example.com). Reload and try again.';

            fetchStub = mockFetchSteps([{ body: page([draftRow(), liveRow, oldRow]) }, apiError(409, 'flow_config_conflict', message)]);

            const { error } = await runCommand(`${restore} --yes --expected-updated-at 1`);

            expect(error?.oclif?.exit).to.equal(exitCode.api);
            expect(error?.message).to.equal(`${message}\nList the versions again and retry.`);
        });

        it('a restore while the draft publishes says to wait, in the text and in --json', async () => {
            fetchStub = mockFetchSteps([
                { body: page([liveRow, oldRow]) },
                apiError(400, 'flow_publishing', 'Flow version is already being published.'),
            ]);

            const { error, exit } = await runJson(`${restore} --json`);

            expect(exit).to.equal(exitCode.api);
            expect(error.message).to.equal('Flow version is already being published.');
            expect(error.hint).to.equal('Wait until the publish ends.');
        });
    });

    describe('flows duplicate', () => {
        const copy = { id: NEW_FLOW, name: 'Onboarding_copy', published_flow_version_id: null, status: 'draft' };

        it('without --version sends {} and prints the new flow id and name', async () => {
            fetchStub = mockFetch([copy]);

            const { stdout } = await runCommand(`flows duplicate ${FLOW} ${APP}`);

            expect(requestOf(fetchStub, 0).url).to.equal(`${BASE}${PATH}/copy/`);
            expect(bodyOf(fetchStub, 0)).to.deep.equal({});
            expect(stdout.trim()).to.equal(`New flow 'Onboarding_copy' (${NEW_FLOW}), not published.`);
        });

        it('--version sends the version id', async () => {
            fetchStub = mockFetch([copy]);

            await runCommand(`flows duplicate ${FLOW} ${APP} --version ${OLD}`);

            expect(bodyOf(fetchStub, 0)).to.deep.equal({ flow_version_id: OLD });
        });

        it('refuses a --version that is not a UUID, with no request', async () => {
            fetchStub = mockFetch([copy]);

            const { error } = await runCommand(`flows duplicate ${FLOW} ${APP} --version v1`);

            expect(error?.oclif?.exit).to.equal(exitCode.usage);
            expect(methods(fetchStub)).to.deep.equal([]);
        });
    });
});
