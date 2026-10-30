import { Flags } from '@oclif/core';

import { decideSave, isFailed, isPending, isSynced, storesWritten } from '../../../../sdk/adapty/index.js';
import { validatePreviewPrices } from '../../../../sdk/adapty/product-prices/index.js';
import { assertValid } from '../../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../../base/adapty/index.js';
import { CliError, exitCode } from '../../../errors.js';
import { appIdFlag } from '../../../input/app.js';
import { confirmAction, yesFlag } from '../../../input/confirm.js';
import { amountFlag, productFlag } from '../../../input/product.js';
import { timeoutFlag } from '../../../input/wait.js';
import { renderPreview, renderRowErrors, renderStorePrices } from '../../../views/product-prices.js';

import { afterSave } from './lib/after-save.js';
import { readPriceFile, rowOfFlags } from './lib/rows.js';

import type { PreviewPricesInput, PricePreview, StorePrice } from '../../../../sdk/adapty/index.js';

/** The same text as the dashboard's "No price changes detected" block. */
const NO_CHANGES = 'No price changes detected. All prices match the current values.';

/** `reason` says why nothing was saved; null when the prices were saved. */
export type SetPricesResult = {
    preview: PricePreview;
    reason: null | 'dry_run' | 'no_changes';
    saved: boolean;
    saved_rows?: number;
    /** The sync of the saved rows, with --wait. */
    sync?: StorePrice[];
    /** With --wait: the budget ran out while a row was still pending. */
    timed_out?: boolean;
};

const rowErrors = (preview: PricePreview): CliError =>
    new CliError(
        `Nothing was saved, the preview has errors:\n${renderRowErrors(preview.errors)}`,
        exitCode.api,
        preview.errors[0]?.error_code,
        { json: { errors: preview.errors, error_code: preview.errors[0]?.error_code } },
    );

const syncFailed = (savedRows: number, prices: readonly StorePrice[]): CliError => {
    const failed = prices.filter(price => isFailed(price));

    return new CliError(
        `The prices were saved, but the store sync failed:\n${renderStorePrices(failed)}`,
        exitCode.api,
        'price_sync_failed',
        { json: { errors: failed, saved: true, saved_rows: savedRows } },
    );
};

/** A saved store missing from the list, or a status that is neither synced, pending nor failed: outcome unknown. */
const syncUnknown = (savedRows: number, prices: readonly StorePrice[]): CliError =>
    new CliError(
        'The prices were saved, but the sync could not be confirmed; `product-prices list` shows it.',
        exitCode.api,
        'price_sync_unknown',
        { json: { saved: true, saved_rows: savedRows, sync: prices } },
    );

export default class ProductPricesSet extends AdaptyCommand {
    static override description
        = 'Save the prices of a product by country. It always previews first (the store rounding: an App Store price '
            + 'goes to the nearest price point) and saves the rounded prices, as the dashboard does; a preview with errors '
            + 'saves nothing and exits 4, one with no difference saves nothing and exits 0. It asks before the save. '
            + 'The store task runs about a minute after the save, so a --wait budget shorter than that cannot see the sync; '
            + '`product-prices list` shows it later. Exit 4 after "Saved" means the store sync failed or could not be confirmed, '
            + 'not the save; any failure after the save says `saved: true` under --json.';

    static override examples = [
        '<%= config.bin %> product-prices set --app 550e8400-... --product 660e8400-... --country DE --app-store-price 9.99 --dry-run',
        '<%= config.bin %> product-prices set --app 550e8400-... --product 660e8400-... --file prices.csv --yes --wait',
    ];

    static override flags = {
        ...appIdFlag,
        ...productFlag,
        ...yesFlag,
        'apply-to-existing-subscribers': Flags.boolean({ default: false, description: 'Also apply the new prices to current subscribers (off by default)' }),
        'app-store-currency': Flags.string({ dependsOn: ['country'], description: 'App Store currency code, e.g. EUR; the store default of the country when omitted, required where the store has no default for the country' }),
        'app-store-price': amountFlag({ dependsOn: ['country'], description: 'App Store price, rounded by the store' }),
        'country': Flags.string({ description: 'Country code, e.g. DE', exactlyOne: ['country', 'file'] }),
        'dry-run': Flags.boolean({ description: 'Print the preview and save nothing' }),
        'file': Flags.string({ description: 'CSV with the columns of `product-prices list --csv`', exactlyOne: ['country', 'file'] }),
        'play-store-currency': Flags.string({ dependsOn: ['country'], description: 'Google Play currency code, e.g. EUR; the store default of the country when omitted, required where the store has no default for the country' }),
        'play-store-price': amountFlag({ dependsOn: ['country'], description: 'Google Play price, rounded by the store' }),
        'timeout': timeoutFlag,
        'wait': Flags.boolean({
            description: 'After the save, poll the store sync until no row is pending: exit 0 when all are synced, 4 when one failed '
                + 'or a status cannot be confirmed. A timeout prints the last rows and exits 0',
            exclusive: ['dry-run'],
        }),
    };

    async run(): Promise<SetPricesResult> {
        const { flags } = await this.parse(ProductPricesSet);

        const input: PreviewPricesInput = {
            rows: flags.file === undefined ? [rowOfFlags(flags)] : readPriceFile(flags.file),
        };

        assertValid(validatePreviewPrices(input));

        const preview = await this.adapty.productPrices.preview(flags.app, flags.product, input);
        const decision = decideSave(preview);

        if (decision === 'row_errors') {
            throw rowErrors(preview);
        }

        if (decision === 'no_changes') {
            this.log(NO_CHANGES);

            return { preview, reason: 'no_changes', saved: false };
        }

        this.log(renderPreview(preview));

        if (flags['dry-run']) {
            this.log('Nothing saved (--dry-run).');

            return { preview, reason: 'dry_run', saved: false };
        }

        const rows = preview.data.rows;
        const changed = preview.difference.rows.length;

        await confirmAction({
            effect: `Saves ${rows.length} ${rows.length === 1 ? 'row' : 'rows'} (${changed} with a change) for product ${flags.product}`
                + `${flags['apply-to-existing-subscribers'] ? ', also for existing subscribers,' : ''} and syncs them to the stores.`,
            interactive: this.interactive,
            signal: this.signal,
            yes: flags.yes,
        });

        const { saved_rows: savedRows } = await this.adapty.productPrices.save(flags.app, flags.product, {
            applyToExistingSubscribers: flags['apply-to-existing-subscribers'],
            rows,
        });

        this.log(`Saved ${savedRows} ${savedRows === 1 ? 'row' : 'rows'}.`);

        if (!flags.wait) {
            return { preview, reason: null, saved: true, saved_rows: savedRows };
        }

        try {
            return await this.#waitForSync(flags.app, flags.product, rows, flags.timeout, { preview, savedRows });
        } catch (error) {
            throw afterSave(error, savedRows);
        }
    }

    async #waitForSync(
        appId: string,
        productId: string,
        rows: PricePreview['data']['rows'],
        timeoutMs: number | undefined,
        { preview, savedRows }: { preview: PricePreview; savedRows: number },
    ): Promise<SetPricesResult> {
        process.stderr.write('Waiting for the store sync…\n');

        const sync = await this.adapty.productPrices.waitFor(appId, productId, rows, {
            onPoll: (prices, delayMs) => {
                process.stderr.write(`${prices.filter(price => isPending(price)).length} pending — checking again in ${Math.round(delayMs / 1000)}s\n`);
            },
            signal: this.signal,
            timeoutMs,
        });

        this.log(renderStorePrices(sync));

        if (sync.some(price => isFailed(price))) {
            throw syncFailed(savedRows, sync);
        }

        const pending = sync.filter(price => isPending(price)).length;

        if (pending > 0) {
            this.log(`Timed out: ${pending} ${pending === 1 ? 'row' : 'rows'} still pending; \`product-prices list\` shows the sync.`);

            return { preview, reason: null, saved: true, saved_rows: savedRows, sync, timed_out: true };
        }

        if (sync.length < storesWritten(rows) || !sync.every(price => isSynced(price))) {
            throw syncUnknown(savedRows, sync);
        }

        return { preview, reason: null, saved: true, saved_rows: savedRows, sync, timed_out: false };
    }
}
