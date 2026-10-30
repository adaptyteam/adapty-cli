import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import { runCommand } from '@oclif/test';
import { expect } from 'chai';

import { exitCode } from '../../src/cli/errors.js';
import {
    assertFetch,
    mockFetch,
    mockFetchFailure,
    requestOf,
    restoreFetch,
    TEST_APP_ID,
    TEST_RESOURCE_ID,
} from '../helpers/mock-fetch.js';

import type sinon from 'sinon';

const PATH = (store: string): string => `/apps/${TEST_APP_ID}/products/${TEST_RESOURCE_ID}/push/${store}/`;
const BASE = `${TEST_RESOURCE_ID} --app ${TEST_APP_ID}`;

const PRODUCT = {
    access_level_id: 'al',
    id: TEST_RESOURCE_ID,
    offers_count: 0,
    period: 'monthly',
    price_usd: 9.99,
    title: 'Monthly',
    vendor_products: { app_store: { base_plan_id: null, id: 'v1', product_id: 'premium', store_status: 'in_review' } },
};

const sentBody = (stub: sinon.SinonStub): unknown => JSON.parse(requestOf(stub, 0).body ?? '');

/** A terminal on both streams, with `typed` as the answer; returns the restore. */
const atTerminal = (typed: string): (() => void) => {
    const stdout = process.stdout as { isTTY?: boolean | undefined };
    const hadStdout = Object.hasOwn(stdout, 'isTTY');
    const wasTty = stdout.isTTY;
    const stdinDescriptor = Object.getOwnPropertyDescriptor(process, 'stdin');
    const input = Object.assign(new PassThrough(), { isTTY: true });

    stdout.isTTY = true;
    input.end(`${typed}\n`);
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

describe('products push', () => {
    let fetchStub: sinon.SinonStub;
    let dirs: string[] = [];

    const tempDir = (): string => {
        const dir = mkdtempSync(join(tmpdir(), 'push-'));
        dirs.push(dir);

        return dir;
    };

    beforeEach(() => {
        process.env.ADAPTY_TOKEN = 'test-token';
    });

    afterEach(() => {
        restoreFetch(fetchStub);
        delete process.env.ADAPTY_TOKEN;

        for (const dir of dirs) {
            rmSync(dir, { force: true, recursive: true });
        }

        dirs = [];
    });

    it('pushes to Google Play with the base plan and prints the status', async () => {
        fetchStub = mockFetch([{ ...PRODUCT, vendor_products: { play_store: { base_plan_id: 'monthly', id: 'v2', product_id: 'premium', store_status: 'draft' } } }]);

        const { stdout } = await runCommand(`products push ${BASE} --store play_store --store-product-id premium --android-base-plan-id monthly --yes`);

        assertFetch({ callIndex: 0, method: 'POST', path: PATH('play_store'), stub: fetchStub });
        expect(sentBody(fetchStub)).to.deep.equal({ base_plan_id: 'monthly', store_product_id: 'premium' });
        expect(stdout).to.contain('Pushed to play_store. Store status: draft');
    });

    it('sends a PNG screenshot as a data URI and a JPEG with its own type', async () => {
        const dir = tempDir();
        writeFileSync(join(dir, 'review.png'), Buffer.from([1, 2, 3]));
        writeFileSync(join(dir, 'review.JPG'), Buffer.from([4, 5, 6]));
        fetchStub = mockFetch([PRODUCT]);

        await runCommand(`products push ${BASE} --store app_store --store-product-id premium --group-id 12 --screenshot ${join(dir, 'review.png')} --yes`);
        await runCommand(`products push ${BASE} --store app_store --store-product-id premium --screenshot ${join(dir, 'review.JPG')} --yes`);

        expect(sentBody(fetchStub)).to.deep.equal({ group_id: '12', screenshot: 'data:image/png;base64,AQID', store_product_id: 'premium' });
        expect(JSON.parse(requestOf(fetchStub, 1).body ?? '')).to.deep.equal({ screenshot: 'data:image/jpeg;base64,BAUG', store_product_id: 'premium' });
    });

    it('refuses a screenshot that is not a PNG or JPEG file, and one that is not there, before any request', async () => {
        fetchStub = mockFetch([PRODUCT]);

        const gif = await runCommand(`products push ${BASE} --store app_store --store-product-id p --screenshot review.gif --yes`);
        const missing = await runCommand(`products push ${BASE} --store app_store --store-product-id p --screenshot /nope/review.png --yes`);

        expect(gif.error?.oclif?.exit).to.equal(exitCode.usage);
        expect(missing.error?.oclif?.exit).to.equal(exitCode.usage);
        expect(missing.error?.message).to.contain('--screenshot: cannot be read: ENOENT');
        expect(fetchStub.callCount).to.equal(0);
    });

    it('refuses an empty screenshot file, before any request', async () => {
        const dir = tempDir();
        writeFileSync(join(dir, 'empty.png'), '');
        fetchStub = mockFetch([PRODUCT]);

        const { error } = await runCommand(`products push ${BASE} --store app_store --store-product-id p --screenshot ${join(dir, 'empty.png')} --yes`);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(error?.message).to.contain('--screenshot: is an empty file');
        expect(fetchStub.callCount).to.equal(0);
    });

    it('refuses a screenshot for Google Play without reading the file', async () => {
        fetchStub = mockFetch([PRODUCT]);

        const { error } = await runCommand(`products push ${BASE} --store play_store --store-product-id p --screenshot /nope/x.png --yes`);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(error?.message).to.contain('--screenshot: is an App Store field');
        expect(error?.message).not.to.contain('cannot be read');
        expect(fetchStub.callCount).to.equal(0);
    });

    it('refuses a screenshot for Google Play, before any request', async () => {
        const dir = tempDir();
        writeFileSync(join(dir, 'x.png'), Buffer.from([1]));
        fetchStub = mockFetch([PRODUCT]);

        const { error } = await runCommand(`products push ${BASE} --store play_store --store-product-id p --screenshot ${join(dir, 'x.png')} --yes`);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(error?.message).to.contain('--screenshot');
        expect(fetchStub.callCount).to.equal(0);
    });

    it('refuses an App Store push without a screenshot, before any request', async () => {
        fetchStub = mockFetch([PRODUCT]);

        const { error } = await runCommand(`products push ${BASE} --store app_store --store-product-id p --group-id 1 --yes`);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(error?.message).to.contain('screenshot');
        expect(fetchStub.callCount).to.equal(0);
    });

    it('asks first: with no terminal it exits 6 and sends nothing', async () => {
        fetchStub = mockFetch([PRODUCT]);

        const { error } = await runCommand(`products push ${BASE} --store play_store --store-product-id premium --android-base-plan-id monthly`);

        expect(error?.oclif?.exit).to.equal(exitCode.confirmRequired);
        expect(fetchStub.callCount).to.equal(0);
    });

    for (const { answer, calls } of [{ answer: 'y', calls: 1 }, { answer: 'n', calls: 0 }]) {
        it(`at a terminal, answering ${answer} ${calls === 1 ? 'pushes' : 'sends nothing'}`, async () => {
            fetchStub = mockFetch([PRODUCT]);
            const restore = atTerminal(answer);

            try {
                await runCommand(`products push ${BASE} --store play_store --store-product-id premium --android-base-plan-id monthly`);
            } finally {
                restore();
            }

            expect(fetchStub.callCount).to.equal(calls);
        });
    }

    it('refuses a base plan on the App Store with the flag name, before any request', async () => {
        fetchStub = mockFetch([PRODUCT]);

        const { error } = await runCommand(`products push ${BASE} --store app_store --store-product-id p --android-base-plan-id m --yes`);

        expect(error?.oclif?.exit).to.equal(exitCode.usage);
        expect(error?.message).to.contain('--android-base-plan-id');
        expect(fetchStub.callCount).to.equal(0);
    });

    it('exits 4 with the server error code when the app has no store credentials', async () => {
        fetchStub = mockFetchFailure({ error_code: 'missing_store_credentials', errors: [], status_code: 400 }, { status: 400 });

        const { error } = await runCommand(`products push ${BASE} --store play_store --store-product-id p --android-base-plan-id m --yes`);

        expect(error?.oclif?.exit).to.equal(exitCode.api);
        expect(error).to.have.property('code', 'missing_store_credentials');
    });

    it('--json prints the product as the server sent it', async () => {
        fetchStub = mockFetch([PRODUCT]);

        const { stdout } = await runCommand(`products push ${BASE} --store play_store --store-product-id premium --android-base-plan-id m --yes --json`);

        expect(JSON.parse(stdout)).to.deep.equal(PRODUCT);
    });
});
