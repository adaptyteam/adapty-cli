import { Command, Flags } from '@oclif/core';

import { createAsaClient } from '../../../lib/asa-client.js';
import { printList, printResponse } from '../../../lib/output.js';

import type {
    AsaBrandKeywordDTO,
    AsaBrandKeywordPoolDTO,
    AsaCompetitorBrandKeywordPoolsDTO,
    AsaGenericKeywordPoolDTO,
    AsaKeywordPoolStatus,
} from '../../../lib/asa-schemas.js';

const TYPES = ['brand', 'generic', 'competitor'] as const;

type RecommendationType = (typeof TYPES)[number];
type PoolType = 'brand' | 'generic';

const PATHS: Record<RecommendationType, string> = {
    brand: '/keyword-recommendations/brand',
    competitor: '/keyword-recommendations/competitor-brand',
    generic: '/keyword-recommendations/generic',
};

type PoolDTO = AsaBrandKeywordPoolDTO | AsaGenericKeywordPoolDTO;
type RecommendationResult = AsaCompetitorBrandKeywordPoolsDTO | PoolDTO;

export default class AsaKeywordsRecommend extends Command {
    static override description
        = 'Keyword recommendations for one of your apps: its brand terms, generic terms, or the brand terms of its selected competitors';

    static override enableJsonFlag = true;
    static override examples = [
        '<%= config.bin %> asa keywords recommend --adam-id 1668337467 --type brand',
        '<%= config.bin %> asa keywords recommend --adam-id 1668337467 --type generic --country US',
        '<%= config.bin %> asa keywords recommend --adam-id 1668337467 --type competitor',
    ];

    static override flags = {
        'adam-id': Flags.integer({
            description: 'Apple App Store ID (adam_id) of your app, from `asa apps list`',
            required: true,
        }),
        'country': Flags.string({
            description: 'ISO country code (e.g. US); repeatable, default every country in the pool',
            multiple: true,
        }),
        'type': Flags.string({ description: 'Which pool to read', options: [...TYPES], required: true }),
    };

    async run(): Promise<RecommendationResult> {
        const { flags } = await this.parse(AsaKeywordsRecommend);

        const countries = (flags.country ?? []).map(code => code.trim().toUpperCase());

        if (countries.some(code => !/^[A-Z]{2}$/.test(code))) {
            this.error('--country takes two-letter ISO codes, e.g. --country US.', { exit: 2 });
        }

        const type = flags.type as RecommendationType;
        const client = await createAsaClient(this);
        const params = { adam_id: String(flags['adam-id']), country: countries.length > 0 ? countries : undefined };

        if (type === 'competitor') {
            const pools = await client.get<AsaCompetitorBrandKeywordPoolsDTO>(PATHS.competitor, params);
            this.printCompetitorPools(pools);

            return pools;
        }

        const pool = await client.get<PoolDTO>(PATHS[type], params);
        this.printPool(pool, type);

        return pool;
    }

    private printCompetitorPools(result: AsaCompetitorBrandKeywordPoolsDTO): void {
        if (result.pools.length === 0) {
            this.log('No competitors selected for this app yet — select them in the Adapty dashboard (Autopilot setup).');

            return;
        }

        for (const [i, pool] of result.pools.entries()) {
            printResponse(
                {
                    competitor_adam_id: pool.competitor_adam_id,
                    status: pool.status,
                    keywords_count: pool.keywords.length,
                },
                this.log.bind(this),
            );

            const hint = this.statusHint(pool.status);

            if (hint !== undefined) {
                this.log(hint);
            }

            if (pool.keywords.length > 0) {
                this.log('');
                printList(pool.keywords.map(keyword => this.omitAdamId(keyword)), this.log.bind(this));
            }

            if (i < result.pools.length - 1) {
                this.log('===');
            }
        }
    }

    private printPool(pool: PoolDTO, type: PoolType): void {
        const header: Record<string, unknown> = { status: pool.status, keywords_count: pool.keywords.length };

        if (type === 'brand') {
            header.brand_terms = (pool as AsaBrandKeywordPoolDTO).brand?.brand_terms ?? [];
        }

        printResponse(header, this.log.bind(this));

        const hint = this.statusHint(pool.status);

        if (hint !== undefined) {
            this.log(hint);
        }

        if (pool.keywords.length > 0) {
            this.log('');

            const keywords = type === 'brand'
                ? (pool.keywords as AsaBrandKeywordDTO[]).map(keyword => this.omitAdamId(keyword))
                : pool.keywords;

            printList(keywords, this.log.bind(this));
        }
    }

    private omitAdamId(keyword: AsaBrandKeywordDTO): Record<string, unknown> {
        const { adam_id: _adamId, ...rest } = keyword;

        return rest;
    }

    private statusHint(status: AsaKeywordPoolStatus): string | undefined {
        if (status === 'building') {
            return 'Still building — retry in about a minute.';
        }

        if (status === 'failed') {
            return 'The pool build failed — retry later or contact support.';
        }

        return undefined;
    }
}
