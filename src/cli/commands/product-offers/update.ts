import { Flags } from '@oclif/core';

import { offerTypes } from '../../../sdk/adapty/index.js';
import { validateUpdateProductOffer } from '../../../sdk/adapty/product-offers/index.js';
import { assertValid } from '../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { offerIdArg } from '../../input/offer.js';
import { renderRecord } from '../../views/record.js';

import type { ProductOffer, UpdateProductOfferInput } from '../../../sdk/adapty/index.js';

export default class ProductOffersUpdate extends AdaptyCommand {
    static override summary = 'Update a product offer';

    static override description
        = 'Reads the offer and writes it back whole: fields you leave out keep their stored value, a change made in the '
            + 'dashboard in between is overwritten, and at least one store offer id must remain.';

    static override examples = [
        '<%= config.bin %> product-offers update 770e8400-... --app 550e8400-... --title "Spring 2"',
        '<%= config.bin %> product-offers update 770e8400-... --app 550e8400-... --clear-android-offer-id',
    ];

    static override args = { ...offerIdArg };

    static override flags = {
        ...appIdFlag,
        'title': Flags.string({ description: 'Offer title' }),
        'type': Flags.option({ description: 'Offer type (win_back is App Store only: clear the Google Play side too)', options: offerTypes })(),
        'ios-offer-id': Flags.string({ description: 'App Store offer ID', exclusive: ['clear-ios-offer-id'] }),
        'android-offer-id': Flags.string({ description: 'Google Play offer ID', exclusive: ['clear-android-offer-id'] }),
        'clear-ios-offer-id': Flags.boolean({ description: 'Remove the App Store side of the offer' }),
        'clear-android-offer-id': Flags.boolean({ description: 'Remove the Google Play side of the offer' }),
    };

    async run(): Promise<ProductOffer> {
        const { args, flags } = await this.parse(ProductOffersUpdate);

        const input: UpdateProductOfferInput = {
            androidOfferId: flags['clear-android-offer-id'] ? null : flags['android-offer-id'],
            iosOfferId: flags['clear-ios-offer-id'] ? null : flags['ios-offer-id'],
            offerType: flags.type,
            title: flags.title,
        };

        assertValid(validateUpdateProductOffer(input));

        const offer = await this.adapty.productOffers.update(flags.app, args.offer_id, input);

        this.log('Offer updated!');
        this.render(offer, renderRecord);

        return offer;
    }
}
