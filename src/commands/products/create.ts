import {Command, Flags} from '@oclif/core'

import type {ProductCreateRequestDTO, ProductDTO, ProductPeriod} from '../../lib/api-schemas.js'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag} from '../../lib/flags.js'
import {printResponse} from '../../lib/output.js'

const VALID_PERIODS = [
  'weekly',
  'monthly',
  'two_months',
  'trimonthly',
  'semiannual',
  'annual',
  'lifetime',
] as const satisfies readonly ProductPeriod[]

const xor = (a?: string, b?: string) => (a === undefined) !== (b === undefined)

export default class ProductsCreate extends Command {
  static description = 'Create a product with vendor products per platform'
static enableJsonFlag = true
static examples = [
    '<%= config.bin %> products create --app UUID --title "Monthly" --access-level-id UUID --period monthly --ios-product-id com.example.monthly',
  ]
static flags = {
    ...appFlag,
    'access-level-id': Flags.string({description: 'Access level ID (UUID)', required: true}),
    'android-base-plan-id': Flags.string({description: 'Android base plan ID', helpGroup: 'STORE BINDINGS'}),
    'android-product-id': Flags.string({description: 'Android product ID', helpGroup: 'STORE BINDINGS'}),
    'ios-product-id': Flags.string({description: 'iOS product ID', helpGroup: 'STORE BINDINGS'}),
    'paddle-price-id': Flags.string({description: 'Paddle price ID (requires --paddle-product-id)', helpGroup: 'STORE BINDINGS'}),
    'paddle-product-id': Flags.string({description: 'Paddle product ID (requires --paddle-price-id)', helpGroup: 'STORE BINDINGS'}),
    period: Flags.string({
      description: 'Subscription period (weekly, monthly, two_months, trimonthly, semiannual, annual, lifetime)',
      required: true,
    }),
    'stripe-price-id': Flags.string({description: 'Stripe price ID (requires --stripe-product-id)', helpGroup: 'STORE BINDINGS'}),
    'stripe-product-id': Flags.string({description: 'Stripe product ID (requires --stripe-price-id)', helpGroup: 'STORE BINDINGS'}),
    title: Flags.string({description: 'Product title', required: true}),
  }

  async run(): Promise<ProductDTO> {
    const {flags} = await this.parse(ProductsCreate)

    if (!(VALID_PERIODS as readonly string[]).includes(flags.period)) {
      this.error(`Invalid period. Must be one of: ${VALID_PERIODS.join(', ')}`, {exit: 2})
    }

    if (xor(flags['stripe-product-id'], flags['stripe-price-id'])) {
      this.error('--stripe-product-id and --stripe-price-id are required together', {exit: 2})
    }

    if (xor(flags['paddle-product-id'], flags['paddle-price-id'])) {
      this.error('--paddle-product-id and --paddle-price-id are required together', {exit: 2})
    }

    if (
      !flags['ios-product-id'] &&
      !flags['android-product-id'] &&
      !flags['stripe-product-id'] &&
      !flags['paddle-product-id']
    ) {
      this.error('At least one store binding is required (ios/android/stripe/paddle)', {exit: 2})
    }

    if (flags['android-product-id'] && !flags['android-base-plan-id'] && flags.period !== 'lifetime') {
      this.error('--android-base-plan-id is required with --android-product-id for subscriptions', {exit: 2})
    }

    const client = await createAuthenticatedClient(this.config)

    const body: ProductCreateRequestDTO = {
      access_level_id: flags['access-level-id'],
      period: flags.period as ProductPeriod,
      title: flags.title,
    }

    if (flags['ios-product-id']) body.ios_product_id = flags['ios-product-id']
    if (flags['android-product-id']) body.android_product_id = flags['android-product-id']
    if (flags['android-base-plan-id']) body.android_base_plan_id = flags['android-base-plan-id']
    if (flags['stripe-product-id']) body.stripe_product_id = flags['stripe-product-id']
    if (flags['stripe-price-id']) body.stripe_price_id = flags['stripe-price-id']
    if (flags['paddle-product-id']) body.paddle_product_id = flags['paddle-product-id']
    if (flags['paddle-price-id']) body.paddle_price_id = flags['paddle-price-id']

    const result = await client.post<ProductDTO>(`/apps/${flags.app}/products`, body)

    this.log('Product created!')
    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))

    return result
  }
}
