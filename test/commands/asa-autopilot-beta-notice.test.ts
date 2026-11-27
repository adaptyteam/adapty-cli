import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Config } from '@oclif/core';
import { runCommand } from '@oclif/test';
import { expect } from 'chai';

import { JOIN_LINE, OPT_OUT_ENV_VAR } from '../../src/cli/hooks/postrun/autopilot-beta-notice.js';
import { mockFetch, mockFetchFailure, restoreFetch } from '../helpers/mock-fetch.js';

import type sinon from 'sinon';

const ME_RESPONSE = {
    access_source: 'payg',
    apple_credentials_status: 'active',
    company_id: '550e8400-e29b-41d4-a716-446655440000',
};

const NOTICE_HEAD = 'Autopilot for Apple Ads is in beta';

describe('asa autopilot beta notice', () => {
    let fetchStub: sinon.SinonStub;
    let noticeFile: string;

    before(async () => {
        const config = await Config.load(join(import.meta.dirname, '..', '..'));
        noticeFile = join(config.configDir, 'autopilot-notice.json');
    });

    beforeEach(() => {
        process.env.ADAPTY_TOKEN = 'dev_live_test';
        Reflect.deleteProperty(process.env, OPT_OUT_ENV_VAR);
    });

    afterEach(() => {
        restoreFetch(fetchStub);
    });

    it('prints the notice on stderr after a successful asa command and keeps stdout clean', async () => {
        fetchStub = mockFetch([ME_RESPONSE]);
        const { stderr, stdout } = await runCommand('asa whoami');
        expect(stderr).to.contain(NOTICE_HEAD);
        expect(stderr).to.contain('adapty asa budget-autopilot status');
        expect(stderr).to.contain(JOIN_LINE);
        expect(stderr).to.contain(`${OPT_OUT_ENV_VAR}=1`);
        expect(stdout).to.not.contain('beta');
    });

    it('leaves --json output a parseable document', async () => {
        fetchStub = mockFetch([ME_RESPONSE]);
        const { stderr, stdout } = await runCommand('asa whoami --json');
        expect(JSON.parse(stdout)).to.deep.equal(ME_RESPONSE);
        expect(stderr).to.contain(NOTICE_HEAD);
    });

    it('is silent on the second command of the same day', async () => {
        fetchStub = mockFetch([ME_RESPONSE]);
        await runCommand('asa whoami');
        const { stderr } = await runCommand('asa whoami');
        expect(stderr).to.not.contain(NOTICE_HEAD);
    });

    it('shows again when the last notice was yesterday', async () => {
        fetchStub = mockFetch([ME_RESPONSE]);
        await mkdir(join(noticeFile, '..'), { recursive: true });
        await writeFile(noticeFile, JSON.stringify({ last_shown: '2000-01-01' }));
        const { stderr } = await runCommand('asa whoami');
        expect(stderr).to.contain(NOTICE_HEAD);
        const saved = JSON.parse(await readFile(noticeFile, 'utf8')) as { last_shown: string };
        expect(saved.last_shown).to.not.equal('2000-01-01');
    });

    it('is silent when the command fails', async () => {
        fetchStub = mockFetchFailure({ detail: 'nope' }, { status: 500 });
        const { stderr } = await runCommand('asa whoami');
        expect(stderr).to.not.contain(NOTICE_HEAD);
    });

    it('is silent for the autopilot commands', async () => {
        fetchStub = mockFetch([{ enrolled: false }]);
        const { stderr } = await runCommand('asa budget-autopilot status');
        expect(stderr).to.not.contain(NOTICE_HEAD);
    });

    it('is silent for a topic outside asa', async () => {
        fetchStub = mockFetch([{ data: [], meta: { pagination: { count: 0, page: 1, pages: 1 } } }]);
        const { stderr } = await runCommand('apps list');
        expect(stderr).to.not.contain(NOTICE_HEAD);
    });

    it('is silent on --help', async () => {
        fetchStub = mockFetch([ME_RESPONSE]);
        const { stderr } = await runCommand('asa whoami --help');
        expect(stderr).to.not.contain(NOTICE_HEAD);
    });

    it('is silent when the user opted out', async () => {
        fetchStub = mockFetch([ME_RESPONSE]);
        process.env[OPT_OUT_ENV_VAR] = '1';
        const { stderr } = await runCommand('asa whoami');
        expect(stderr).to.not.contain(NOTICE_HEAD);
    });
});
