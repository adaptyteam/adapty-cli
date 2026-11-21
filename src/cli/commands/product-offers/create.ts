import { Flags } from '@oclif/core';

import { offerTypes } from '../../../sdk/adapty/index.js';
import { billingPlanApplied, validateCreateProductOffer } from '../../../sdk/adapty/product-offers/index.js';
import { assertValid } from '../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../base/adapty/index.js';
import { planNotSavedError } from '../../errors/monthly-plan.js';
import { withUnknownResult } from '../../errors/retention-messaging.js';
import { appIdFlag } from '../../input/app.js';
import { billingPlanFlag } from '../../input/offer.js';
import { productFlag } from '../../input/product.js';
import { renderOffer } from '../../views/product-offers.js';

import type { CreateProductOfferInput, ProductOffer } from '../../../sdk/adapty/index.js';

export default class ProductOffersCreate extends AdaptyCommand {
    static override summary = 'Create an offer for a product';

    static override description
        = 'The create is sent once and never repeated. If its answer is lost, the result is unknown: do not create again; '
            + 'find the offer by its title and App Store offer id in `product-offers list`. A --billing-plan that the answer '
            + 'does not carry exits 4 with the code `billing_plan_not_applied` and the id of the saved offer.';

    static override examples = [
        '<%= config.bin %> product-offers create --app 550e8400-... --product 660e8400-... --title "Spring" --type promotional --ios-offer-id spring_ios --android-offer-id spring-android',
        '<%= config.bin %> product-offers create --app 550e8400-... --product 660e8400-... --title "Come back" --type win_back --ios-offer-id winback_ios',
        '<%= config.bin %> product-offers create --app 550e8400-... --product 660e8400-... --title "Monthly deal" --type promotional --ios-offer-id deal_ios --billing-plan monthly',
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
        ...billingPlanFlag('Upfront when not given.'),
    };

    async run(): Promise<ProductOffer> {
        const { flags } = await this.parse(ProductOffersCreate);

        const input: CreateProductOfferInput = {
            androidOfferId: flags['android-offer-id'],
            billingPlan: flags['billing-plan'],
            iosOfferId: flags['ios-offer-id'],
            offerType: flags.type,
            title: flags.title,
        };

        assertValid(validateCreateProductOffer(input));

        const { productOffers } = this.adapty;

        const offer = await productOffers.create(flags.app, flags.product, input).catch((error: unknown) => {
            throw withUnknownResult(error, 'Do not repeat the create: it can make a second offer. Find the offer by its '
                + `title and App Store offer id in \`adapty product-offers list --app ${flags.app} --product ${flags.product}\`.`);
        });

        if (input.billingPlan !== undefined && !billingPlanApplied(offer, input.billingPlan)) {
            throw planNotSavedError(offer.id);
        }

        this.log('Offer created!');
        this.render(offer, renderOffer);

        return offer;
    }
}
