import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import { runCommand } from '@oclif/test';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { exitCode } from '../../src/cli/errors.js';
import {
    assertFetch,
    mockFetch,
    mockFetchSteps,
    requestOf,
    restoreFetch,
    TEST_APP_ID,
    TEST_RESOURCE_ID,
} from '../helpers/mock-fetch.js';

const PRICES = `/apps/${TEST_APP_ID}/products/${TEST_RESOURCE_ID}/prices/`;
const BASE = `--app ${TEST_APP_ID} --product ${TEST_RESOURCE_ID}`;

const ROW = {
    app_store_currency: 'EUR',
    app_store_requested_price: 9.99,
    app_store_sync_error: null,
    app_store_sync_status: 'synced',
    app_store_synced_price: 9.99,
    play_store_currency: 'EUR',
    play_store_requested_price: 8.5,
    play_store_sync_error: null,
    play_store_sync_status: null,
    play_store_synced_price: 8.5,
    region_code: 'DE',
    region_name: 'Germany, Federal Republic of',
};

const page = (...rows: object[]) => ({ data: rows, meta: { pagination: { count: rows.length, page: 1, pages: 1 } } });

const CHANGE = { app_store_current_price: 10.99, app_store_proposed_price: 9.99, app_store_rounded_price: 9.99, region_code: 'DE', region_name: 'Germany' };
const WRITE_ROWS = [{ app_store_currency: 'EUR', app_store_price: 9.99, region_code: 'DE', region_name: 'Germany' }];
const PREVIEW = { data: { rows: WRITE_ROWS }, difference: { rows: [CHANGE] }, errors: [] };

const FLAGS = `${BASE} --country DE --app-store-price 9.99`;

const bodyOf = (stub: sinon.SinonStub, callIndex: number): unknown => JSON.parse(requestOf(stub, callIndex).body ?? '');

/** Under --json oclif prints the error as JSON and sets the process exit code instead of throwing. */
const runJson = async (args: string): Promise<{ error: Record<string, unknown>; exit: unknown }> => {
    process.exitCode = undefined;

    const { stdout } = await runCommand(args);
    const exit = process.exitCode;

    process.exitCode = undefined;

    return { error: (JSON.parse(stdout) as { error: Record<string, unknown> }).error, exit };
};

const tempDirs: string[] = [];

const writeCsv = (text: string): string => {
    const dir = mkdtempSync(join(tmpdir(), 'prices-'));
    tempDirs.push(dir);

    const file = join(dir, 'prices.csv');
    writeFileSync(file, text);

    return file;
};

/** A person at a terminal who types `typed`; Node deletes isTTY on a pipe, so it is put back as found. */
const withTerminal = async (typed: string, body: () => Promise<void>): Promise<void> => {
    const stdout = process.stdout as { isTTY?: boolean | undefined };
    const hadStdout = Object.hasOwn(stdout, 'isTTY');
    const wasTty = stdout.isTTY;
    const stdinDescriptor = Object.getOwnPropertyDescriptor(process, 'stdin');
    const input = Object.assign(new PassThrough(), { isTTY: true });

    stdout.isTTY = true;
    input.end(`${typed}\n`);
    Object.defineProperty(process, 'stdin', { configurable: true, value: input });

    try {
        await body();
    } finally {
        if (hadStdout) {
            stdout.isTTY = wasTty;
        } else {
            delete stdout.isTTY;
        }

        if (stdinDescriptor) {
            Object.defineProperty(process, 'stdin', stdinDescriptor);
        }
    }
};

describe('product-prices', () => {
    let fetchStub: sinon.SinonStub;

    beforeEach(() => {
        process.env.ADAPTY_TOKEN = 'test-token';
    });

    afterEach(() => {
        restoreFetch(fetchStub);
        delete process.env.ADAPTY_TOKEN;

        for (const dir of tempDirs.splice(0)) {
            rmSync(dir, { force: true, recursive: true });
        }
    });

    describe('list', () => {
        it('calls GET under the product and prints one line per country and store', async () => {
            fetchStub = mockFetch([page(ROW)]);

            const { stdout } = await runCommand(`product-prices list ${BASE}`);

            assertFetch({ callIndex: 0, method: 'GET', path: PRICES, stub: fetchStub });

            expect(stdout.split('\n').slice(0, 3)).to.deep.equal([
                'Country                       Code       Store  Currency  Requested  Synced  Status',
                'Germany, Federal Republic of    DE   app_store       EUR       9.99    9.99  synced',
                'Germany, Federal Republic of    DE  play_store       EUR        8.5     8.5       —',
            ]);
        });

        const HEADER = 'region_name,region_code,app_store_currency,app_store_requested_price,app_store_synced_price,'
            + 'app_store_sync_status,play_store_currency,play_store_requested_price,play_store_synced_price,play_store_sync_status';

        it('--csv prints the columns of the dashboard price download, an empty status as an empty field', async () => {
            fetchStub = mockFetch([page(ROW)]);

            const { stdout } = await runCommand(`product-prices list ${BASE} --csv`);

            expect(stdout).to.equal(`${HEADER}\r\n"Germany, Federal Republic of",DE,EUR,9.99,9.99,synced,EUR,8.50,8.50,\r\n`);
        });

        const forms = [
            { name: 'an integer-valued price', price: 3990, text: '3990.00' },
            { name: 'one decimal', price: 249.9, text: '249.90' },
            { name: 'two decimals', price: 0.99, text: '0.99' },
            { name: 'no price', price: null, text: '' },
        ];

        for (const { name, price, text } of forms) {
            it(`--csv writes ${name} with 2 decimals, or an empty field, in all four price columns`, async () => {
                fetchStub = mockFetch([page({
                    ...ROW,
                    app_store_requested_price: price,
                    app_store_synced_price: price,
                    play_store_requested_price: price,
                    play_store_synced_price: price,
                })]);

                const { stdout } = await runCommand(`product-prices list ${BASE} --csv`);

                expect(stdout.split('\r\n')[1]).to.equal(`"Germany, Federal Republic of",DE,EUR,${text},${text},synced,EUR,${text},${text},`);
            });
        }

        it('--csv of a product with no prices prints the header only', async () => {
            fetchStub = mockFetch([page()]);

            const { stdout } = await runCommand(`product-prices list ${BASE} --csv`);

            expect(stdout).to.equal(`${HEADER}\r\n`);
        });

        it('the table falls back to the country code when the server sends no name', async () => {
            fetchStub = mockFetch([page({ ...ROW, region_name: '' })]);

            const { stdout } = await runCommand(`product-prices list ${BASE}`);

            expect(stdout.split('\n')[1]).to.match(/^DE +DE +app_store/);
        });

        it('prints the failure of a failed row only, not the old error of a row that went back to pending', async () => {
            fetchStub = mockFetch([page(
                { ...ROW, app_store_sync_error: 'Old failure', app_store_sync_status: 'pending' },
                { ...ROW, play_store_sync_error: 'Price point not found', play_store_sync_status: 'failed', region_code: 'FR', region_name: '' },
            )]);

            const { stdout } = await runCommand(`product-prices list ${BASE}`);

            expect(stdout).to.not.contain('Old failure');
            expect(stdout).to.contain('FR play_store: Price point not found');
        });

        it('--json prints the page as the server sent it', async () => {
            fetchStub = mockFetch([page(ROW)]);

            const { stdout } = await runCommand(`product-prices list ${BASE} --json`);

            expect(JSON.parse(stdout)).to.deep.equal(page(ROW));
        });
    });

    describe('set', () => {
        it('--dry-run previews and saves nothing', async () => {
            fetchStub = mockFetch([PREVIEW]);

            const { stdout } = await runCommand(`product-prices set ${FLAGS} --dry-run`);

            expect(fetchStub.callCount).to.equal(1);
            assertFetch({ callIndex: 0, method: 'POST', path: `${PRICES}preview/`, stub: fetchStub });
            expect(bodyOf(fetchStub, 0)).to.deep.equal({ rows: [{ app_store_price: 9.99, region_code: 'DE' }] });

            expect(stdout.split('\n')).to.deep.equal([
                'Country      Store  Currency  Current  Proposed  Rounded',
                'DE       app_store         —    10.99      9.99     9.99',
                'Nothing saved (--dry-run).',
                '',
            ]);
        });

        it('the preview shows the currency of each store, so a currency-only change is visible', async () => {
            fetchStub = mockFetch([{ ...PREVIEW, difference: { rows: [{ ...CHANGE, app_store_currency: 'USD' }] } }]);

            const { stdout } = await runCommand(`product-prices set ${FLAGS} --dry-run`);

            expect(stdout.split('\n').slice(0, 2)).to.deep.equal([
                'Country      Store  Currency  Current  Proposed  Rounded',
                'DE       app_store       USD    10.99      9.99     9.99',
            ]);
        });

        it('--yes saves the rows of the preview answer, the rounded prices, not the rows it sent', async () => {
            fetchStub = mockFetch([{ ...PREVIEW, data: { rows: [{ app_store_price: 9.95, region_code: 'DE' }] } }, { saved_rows: 1 }]);

            const { stdout } = await runCommand(`product-prices set ${FLAGS} --yes`);

            assertFetch({ callIndex: 1, method: 'POST', path: PRICES, stub: fetchStub });
            expect(bodyOf(fetchStub, 1)).to.deep.equal({ apply_to_existing_subscribers: false, rows: [{ app_store_price: 9.95, region_code: 'DE' }] });
            expect(stdout).to.contain('Saved 1 row.');
        });

        it('--apply-to-existing-subscribers sets the flag of the save', async () => {
            fetchStub = mockFetch([PREVIEW, { saved_rows: 1 }]);

            await runCommand(`product-prices set ${FLAGS} --yes --apply-to-existing-subscribers`);

            expect(bodyOf(fetchStub, 1)).to.include({ apply_to_existing_subscribers: true });
        });

        it('asks first: with no terminal it exits 6 after the preview and saves nothing', async () => {
            fetchStub = mockFetch([PREVIEW, { saved_rows: 1 }]);

            const { error } = await runCommand(`product-prices set ${FLAGS}`);

            expect(error?.oclif?.exit).to.equal(exitCode.confirmRequired);
            expect(fetchStub.callCount).to.equal(1);
        });

        it('asks first: under --json without --yes it exits 6 and saves nothing', async () => {
            fetchStub = mockFetch([PREVIEW, { saved_rows: 1 }]);

            const { exit } = await runJson(`product-prices set ${FLAGS} --json`);

            expect(exit).to.equal(exitCode.confirmRequired);
            expect(fetchStub.callCount).to.equal(1);
        });

        it('at a terminal it says how many rows the save sends, and "n" saves nothing', async () => {
            const unchanged = { app_store_price: 4.99, region_code: 'FR' };
            fetchStub = mockFetch([{ ...PREVIEW, data: { rows: [...WRITE_ROWS, unchanged] } }, { saved_rows: 2 }]);

            await withTerminal('n', async () => {
                const { error, stderr } = await runCommand(`product-prices set ${FLAGS}`);

                expect(error?.oclif?.exit).to.equal(1);
                expect(error?.message).to.equal('Cancelled, nothing was sent.');
                expect(stderr).to.contain(`Saves 2 rows (1 with a change) for product ${TEST_RESOURCE_ID} and syncs them to the stores.`);
            });

            expect(fetchStub.callCount).to.equal(1);
        });

        it('at a terminal "y" saves', async () => {
            fetchStub = mockFetch([PREVIEW, { saved_rows: 1 }]);

            await withTerminal('y', async () => {
                const { error, stdout } = await runCommand(`product-prices set ${FLAGS}`);

                expect(error).to.equal(undefined);
                expect(stdout).to.contain('Saved 1 row.');
            });

            assertFetch({ callIndex: 1, method: 'POST', path: PRICES, stub: fetchStub });
        });

        it('--json without --wait prints the saved rows and no sync', async () => {
            fetchStub = mockFetch([PREVIEW, { saved_rows: 1 }]);

            const { stdout } = await runCommand(`product-prices set ${FLAGS} --yes --json`);

            expect(JSON.parse(stdout)).to.deep.equal({ preview: PREVIEW, reason: null, saved: true, saved_rows: 1 });
        });

        it('--json of a preview with row errors names the code and lists the errors', async () => {
            const errors = [{ column: 'region_code', error_code: 'invalid_region_code', message: 'Unknown region code', row: 1, value: 'XX' }];
            fetchStub = mockFetch([{ ...PREVIEW, difference: { rows: [] }, errors }]);

            const { error, exit } = await runJson(`product-prices set ${BASE} --country XX --app-store-price 9.99 --yes --json`);

            expect(exit).to.equal(exitCode.api);
            expect(error).to.include({ code: 'invalid_region_code', error_code: 'invalid_region_code' });
            expect(error.errors).to.deep.equal(errors);
            expect(error.message).to.match(/^Nothing was saved/);
            expect(error).to.not.have.property('saved');
        });

        it('a preview with row errors prints them, exits 4 and saves nothing', async () => {
            const errors = [
                { column: 'region_code', error_code: 'invalid_region_code', message: 'Unknown region code \'XX\'', row: 1, value: 'XX' },
                { column: 'app_store_currency', error_code: 'missing_currency', message: 'Currency is required for region \'XX\' in app_store. Unable to determine default currency.', row: 1, value: 'XX' },
            ];

            fetchStub = mockFetch([{ ...PREVIEW, difference: { rows: [] }, errors }]);

            const { error } = await runCommand(`product-prices set ${BASE} --country XX --app-store-price 9.99 --yes`);

            expect(error?.oclif?.exit).to.equal(exitCode.api);
            expect(error).to.have.property('code', 'invalid_region_code');
            expect(error?.message).to.contain('invalid_region_code: Unknown region code \'XX\' (row 1, column region_code)');
            expect(error?.message).to.contain('missing_currency: Currency is required for region \'XX\' in app_store. Unable to determine default currency. (row 1, column app_store_currency)');
            expect(fetchStub.callCount).to.equal(1);
        });

        it('the store credentials error of the preview exits 4 with its text, also with --dry-run', async () => {
            const errors = [{ error_code: 'product_prices_import_base_error', message: 'Missing App Store credentials' }];
            fetchStub = mockFetch([{ ...PREVIEW, errors }]);

            const { error } = await runCommand(`product-prices set ${FLAGS} --dry-run`);

            expect(error?.oclif?.exit).to.equal(exitCode.api);
            expect(error?.message).to.contain('Missing App Store credentials');
        });

        it('a preview with no difference prints the dashboard text, exits 0 and saves nothing', async () => {
            fetchStub = mockFetch([{ ...PREVIEW, difference: { rows: [] } }]);

            const { error, stdout } = await runCommand(`product-prices set ${FLAGS} --yes`);

            expect(error).to.equal(undefined);
            expect(stdout).to.contain('No price changes detected. All prices match the current values.');
            expect(fetchStub.callCount).to.equal(1);
        });

        it('--json of a preview with no difference says why nothing was saved', async () => {
            const same = { ...PREVIEW, difference: { rows: [] } };
            fetchStub = mockFetch([same]);

            const { stdout } = await runCommand(`product-prices set ${FLAGS} --yes --json`);

            expect(JSON.parse(stdout)).to.deep.equal({ preview: same, reason: 'no_changes', saved: false });
        });

        it('--json prints the result with the preview and the reason nothing was saved', async () => {
            fetchStub = mockFetch([PREVIEW]);

            const { stdout } = await runCommand(`product-prices set ${FLAGS} --dry-run --json`);

            expect(JSON.parse(stdout)).to.deep.equal({ preview: PREVIEW, reason: 'dry_run', saved: false });
        });

        it('--file sends the requested prices of the CSV of `list --csv` and drops the synced columns', async () => {
            const header = 'region_name,region_code,app_store_currency,app_store_requested_price,app_store_synced_price,'
                + 'app_store_sync_status,play_store_currency,play_store_requested_price,play_store_synced_price,play_store_sync_status';

            const file = writeCsv(`${header}\r\n"Germany, Federal Republic of",DE,EUR,10.00,9.99,synced,EUR,,,\r\nFrance,FR,EUR,,,,EUR,7.5,7.5,failed\r\n`);
            fetchStub = mockFetch([PREVIEW]);

            await runCommand(`product-prices set ${BASE} --file ${file} --dry-run`);

            expect(bodyOf(fetchStub, 0)).to.deep.equal({
                rows: [
                    { app_store_currency: 'EUR', app_store_price: 10, play_store_currency: 'EUR', region_code: 'DE', region_name: 'Germany, Federal Republic of' },
                    { app_store_currency: 'EUR', play_store_currency: 'EUR', play_store_price: 7.5, region_code: 'FR', region_name: 'France' },
                ],
            });
        });

        it('a --file that cannot be read exits 2 before any request', async () => {
            fetchStub = mockFetch([PREVIEW]);

            const { error } = await runCommand(`product-prices set ${BASE} --file /nope/prices.csv --dry-run`);

            expect(error?.oclif?.exit).to.equal(exitCode.usage);
            expect(error?.message).to.contain('cannot be read');
            expect(fetchStub.callCount).to.equal(0);
        });

        it('--file without a region_code column exits 2 before any request', async () => {
            fetchStub = mockFetch([PREVIEW]);

            const { error } = await runCommand(`product-prices set ${BASE} --file ${writeCsv('country,price\nDE,9.99\n')} --dry-run`);

            expect(error?.oclif?.exit).to.equal(exitCode.usage);
            expect(fetchStub.callCount).to.equal(0);
        });

        it('--file without a requested price column names the missing columns', async () => {
            fetchStub = mockFetch([PREVIEW]);

            const { error } = await runCommand(`product-prices set ${BASE} --file ${writeCsv('region_code,app_store_synced_price\nDE,9.99\n')} --dry-run`);

            expect(error?.oclif?.exit).to.equal(exitCode.usage);
            expect(error?.message).to.contain('has neither an app_store_requested_price nor a play_store_requested_price column');
            expect(fetchStub.callCount).to.equal(0);
        });

        it('a --file row the sdk refuses is named by its line in the file, not its place among the rows kept', async () => {
            const file = writeCsv('region_code,app_store_requested_price\nDE,\n\nFR,9.99\nXYZ,9.99\n');
            fetchStub = mockFetch([PREVIEW]);

            const { error } = await runCommand(`product-prices set ${BASE} --file ${file} --dry-run`);

            expect(error?.oclif?.exit).to.equal(exitCode.usage);
            expect(error?.message).to.contain('line 5: the country code must be 2 letters');
            expect(fetchStub.callCount).to.equal(0);
        });

        it('takes the currencies of the flags', async () => {
            fetchStub = mockFetch([PREVIEW]);

            await runCommand(`product-prices set ${FLAGS} --app-store-currency EUR --play-store-price 8 --play-store-currency EUR --dry-run`);

            expect(bodyOf(fetchStub, 0)).to.deep.equal({
                rows: [{ app_store_currency: 'EUR', app_store_price: 9.99, play_store_currency: 'EUR', play_store_price: 8, region_code: 'DE' }],
            });
        });

        const usage = [
            { flags: `${BASE} --country DE`, name: '--country without a price' },
            { flags: `${BASE} --country DE --app-store-price 0`, name: 'a price of 0' },
            { flags: `${BASE} --country DE --app-store-price abc`, name: 'a price that is not a number' },
            { flags: `${BASE} --country DE --app-store-price 1e3`, name: 'a price with an exponent' },
            { flags: `${BASE} --country DE --app-store-price 0x10`, name: 'a hex price' },
            { flags: `${BASE} --country DE --play-store-price -1`, name: 'a negative price' },
            { flags: `${BASE} --app-store-price 9.99`, name: 'a price without --country' },
            { flags: `${BASE} --country ß --app-store-price 9.99`, name: 'a country that upper-cases to 2 ASCII letters' },
            { flags: `${BASE} --country ıd --app-store-price 9.99`, name: 'a dotless i in the country' },
            { flags: `${FLAGS} --app-store-currency euß`, name: 'a currency that upper-cases to 3 ASCII letters' },
            { flags: BASE, name: 'neither --country nor --file' },
            { flags: `${FLAGS} --file x.csv`, name: '--country together with --file' },
            { flags: `${BASE} --file x.csv --app-store-price 9.99`, name: '--file together with --app-store-price' },
            { flags: `${FLAGS} --dry-run --wait`, name: '--wait together with --dry-run' },
            { flags: `${FLAGS} --timeout 30s`, name: '--timeout without --wait' },
            { flags: `${FLAGS} --wait --timeout 601`, name: 'a timeout over 600 seconds' },
        ];

        for (const { flags, name } of usage) {
            it(`${name} exits 2 and sends nothing`, async () => {
                fetchStub = mockFetch([PREVIEW]);

                const { error } = await runCommand(`product-prices set ${flags}`);

                expect(error?.oclif?.exit).to.equal(exitCode.usage);
                expect(fetchStub.callCount).to.equal(0);
            });
        }

        describe('--wait', () => {
            const synced = { ...ROW, app_store_sync_status: 'synced' };

            it('exits 0 when every saved row is synced', async () => {
                fetchStub = mockFetch([PREVIEW, { saved_rows: 1 }, page(synced)]);

                const { error, stderr, stdout } = await runCommand(`product-prices set ${FLAGS} --yes --wait`);

                expect(error).to.equal(undefined);
                assertFetch({ callIndex: 2, method: 'GET', path: PRICES, stub: fetchStub });
                expect(stderr).to.contain('Waiting for the store sync…');
                expect(stdout).to.not.contain('Waiting');
                expect(stdout).to.contain('Germany, Federal Republic of    DE  app_store       EUR       9.99    9.99  synced');
            });

            for (const status of ['failed', 'subscribers_migration_failed']) {
                it(`exits 4 and prints the error of a ${status} row`, async () => {
                    const failed = { ...ROW, app_store_sync_error: 'Price point not found', app_store_sync_status: status };
                    fetchStub = mockFetch([PREVIEW, { saved_rows: 1 }, page(failed)]);

                    const { error } = await runCommand(`product-prices set ${FLAGS} --yes --wait`);

                    expect(error?.oclif?.exit).to.equal(exitCode.api);
                    expect(error?.message).to.match(/^The prices were saved, but the store sync failed/);
                    expect(error?.message).to.contain('Germany, Federal Republic of (DE) app_store: Price point not found');
                });
            }

            it('--json of a failed sync says the prices were saved', async () => {
                const failed = { ...ROW, app_store_sync_error: 'Price point not found', app_store_sync_status: 'failed' };
                fetchStub = mockFetch([PREVIEW, { saved_rows: 1 }, page(failed)]);

                const { error, exit } = await runJson(`product-prices set ${FLAGS} --yes --wait --json`);

                expect(exit).to.equal(exitCode.api);
                expect(error).to.include({ code: 'price_sync_failed', saved: true, saved_rows: 1 });
                expect(error.errors).to.have.length(1);
                expect(error.errors).to.have.nested.property('[0].status', 'failed');
            });

            it('exits 4 when the list has no saved row, since the sync cannot be confirmed', async () => {
                fetchStub = mockFetch([PREVIEW, { saved_rows: 1 }, page({ ...ROW, region_code: 'FR' })]);

                const { error, exit } = await runJson(`product-prices set ${FLAGS} --yes --wait --json`);

                expect(exit).to.equal(exitCode.api);
                expect(error).to.include({ code: 'price_sync_unknown', saved: true, saved_rows: 1 });
                expect(error.sync).to.deep.equal([]);
                expect(error.message).to.match(/^The prices were saved, but the sync could not be confirmed/);
            });

            it('exits 4 when one of the saved rows is missing from the list', async () => {
                const twoRows = {
                    ...PREVIEW,
                    data: { rows: [...WRITE_ROWS, { ...WRITE_ROWS[0], region_code: 'FR', region_name: 'France' }] },
                };

                fetchStub = mockFetch([twoRows, { saved_rows: 2 }, page(ROW)]);

                const { error, exit } = await runJson(`product-prices set ${FLAGS} --yes --wait --json`);

                expect(exit).to.equal(exitCode.api);
                expect(error).to.include({ code: 'price_sync_unknown', saved: true, saved_rows: 2 });
                expect(error.sync).to.have.length(1);
            });

            it('exits 4 on a status that is neither synced, pending nor failed', async () => {
                fetchStub = mockFetch([PREVIEW, { saved_rows: 1 }, page({ ...ROW, app_store_sync_status: 'paused' })]);

                const { error } = await runCommand(`product-prices set ${FLAGS} --yes --wait`);

                expect(error?.oclif?.exit).to.equal(exitCode.api);
                expect(error).to.have.property('code', 'price_sync_unknown');
                expect(error?.message).to.contain('`product-prices list`');
            });

            describe('a failure of the wait itself', () => {
                it('a refusal of the list still says the prices were saved, with exit 4', async () => {
                    fetchStub = mockFetchSteps([
                        { body: PREVIEW },
                        { body: { saved_rows: 1 } },
                        { body: { error_code: 'adapty_product_does_not_exist', errors: [], status_code: 404 }, status: 404 },
                    ]);

                    const { error, exit } = await runJson(`product-prices set ${FLAGS} --yes --wait --json`);

                    expect(exit).to.equal(exitCode.api);
                    expect(error).to.include({ code: 'adapty_product_does_not_exist', saved: true, saved_rows: 1 });
                    expect(error.message).to.match(/^The prices were saved, but reading the sync failed: /);
                });

                it('Ctrl+C during the wait still says the prices were saved, with exit 130', async () => {
                    fetchStub = mockFetchSteps([{ body: PREVIEW }, { body: { saved_rows: 1 } }]);

                    fetchStub.onThirdCall().callsFake(() => {
                        process.emit('SIGINT', 'SIGINT');

                        return Promise.reject(new Error('aborted'));
                    });

                    const { error, exit } = await runJson(`product-prices set ${FLAGS} --yes --wait --json`);

                    expect(exit).to.equal(exitCode.cancelled);
                    expect(error).to.include({ saved: true, saved_rows: 1 });
                    expect(error.message).to.match(/^The prices were saved, but the wait was cancelled; `product-prices list`/);
                });

                it('a network failure of the list still says the prices were saved, with exit 5', async () => {
                    fetchStub = sinon.stub(globalThis, 'fetch');
                    fetchStub.onCall(0).resolves(new Response(JSON.stringify(PREVIEW), { headers: { 'content-type': 'application/json' } }));
                    fetchStub.onCall(1).resolves(new Response(JSON.stringify({ saved_rows: 1 }), { headers: { 'content-type': 'application/json' } }));
                    fetchStub.rejects(new TypeError('fetch failed'));

                    const { error, exit } = await runJson(`product-prices set ${FLAGS} --yes --wait --json`);

                    expect(exit).to.equal(exitCode.network);
                    expect(error).to.include({ code: 'network_error', saved: true, saved_rows: 1 });
                    expect(error.message).to.match(/^The prices were saved, but reading the sync failed: Could not reach/);
                });
            });

            it('a timeout prints the last rows and exits 0', async () => {
                const pending = { ...ROW, app_store_sync_status: 'pending' };
                fetchStub = mockFetchSteps([{ body: PREVIEW }, { body: { saved_rows: 1 } }, { body: page(pending) }]);

                const { error, stdout } = await runCommand(`product-prices set ${FLAGS} --yes --wait --timeout 1s`);

                expect(error).to.equal(undefined);
                expect(fetchStub.callCount).to.equal(3);
                expect(stdout).to.contain('pending');
                expect(stdout).to.contain('Timed out: 1 row still pending; `product-prices list` shows the sync.');
            });

            it('--json of a timeout sets timed_out', async () => {
                const pending = { ...ROW, app_store_sync_status: 'pending' };
                fetchStub = mockFetchSteps([{ body: PREVIEW }, { body: { saved_rows: 1 } }, { body: page(pending) }]);

                const { stdout } = await runCommand(`product-prices set ${FLAGS} --yes --wait --timeout 1s --json`);

                expect(JSON.parse(stdout)).to.include({ saved: true, saved_rows: 1, timed_out: true });
            });

            it('--json prints the result with the sync rows', async () => {
                fetchStub = mockFetch([PREVIEW, { saved_rows: 1 }, page(synced)]);

                const { stdout } = await runCommand(`product-prices set ${FLAGS} --yes --wait --json`);

                expect(JSON.parse(stdout)).to.deep.equal({
                    preview: PREVIEW,
                    reason: null,
                    saved: true,
                    saved_rows: 1,
                    sync: [{
                        currency: 'EUR',
                        error: null,
                        region_code: 'DE',
                        region_name: 'Germany, Federal Republic of',
                        requested_price: 9.99,
                        status: 'synced',
                        store: 'app_store',
                        synced_price: 9.99,
                    }],
                    timed_out: false,
                });
            });
        });
    });
});
