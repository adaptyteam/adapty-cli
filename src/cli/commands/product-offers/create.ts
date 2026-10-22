import { Flags } from '@oclif/core';

import { offerTypes } from '../../../sdk/adapty/index.js';
import { validateCreateProductOffer } from '../../../sdk/adapty/product-offers/index.js';
import { assertValid } from '../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { productFlag } from '../../input/uuid.js';
import { renderRecord } from '../../views/record.js';

import type { CreateProductOfferInput, ProductOffer } from '../../../sdk/adapty/index.js';

export default class ProductOffersCreate extends AdaptyCommand {
    static override description = 'Create an offer for a product';

    static override examples = [
        '<%= config.bin %> product-offers create --app 550e8400-... --product 660e8400-... --title "Spring" --type promotional --ios-offer-id spring_ios --android-offer-id spring-android',
        '<%= config.bin %> product-offers create --app 550e8400-... --product 660e8400-... --title "Come back" --type win_back --ios-offer-id winback_ios',
    ];

    static override flags = {
        ...appIdFlag,
        ...productFlag,
        'title': Flags.string({ description: 'Offer title', required: true }),
        'type': Flags.option({
            description: 'Offer type (win_back is App Store only)',
            options: offerTypes,
            required: true,
        })(),
        'ios-offer-id': Flags.string({ description: 'App Store offer ID' }),
        'android-offer-id': Flags.string({ description: 'Google Play offer ID' }),
    };

    async run(): Promise<ProductOffer> {
        const { flags } = await this.parse(ProductOffersCreate);

        const input: CreateProductOfferInput = {
            androidOfferId: flags['android-offer-id'],
            iosOfferId: flags['ios-offer-id'],
            offerType: flags.type,
            title: flags.title,
        };

        assertValid(validateCreateProductOffer(input));

        const offer = await this.adapty.productOffers.create(flags.app, flags.product, input);

        this.log('Offer created!');
        this.render(offer, renderRecord);

        return offer;
    }
}
