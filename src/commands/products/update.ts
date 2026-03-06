import {Args, Command, Flags} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, isValidUuid} from '../../lib/flags.js'

interface VendorProducts {
  android?: {base_plan_id?: string; id: string; product_id: string}
  ios?: {id: string; product_id: string}
}

interface ProductResponse {
  id: string
  name: string
  vendor_products: VendorProducts
}

const VALID_PERIODS = ['weekly', 'monthly', '2_months', '3_months', '6_months', 'yearly', 'lifetime']

export default class ProductsUpdate extends Command {
  static args = {
    product_id: Args.string({description: 'Product ID (UUID)', required: true}),
  }
static description = 'Update a product'
static enableJsonFlag = true
static examples = [
    '<%= config.bin %> products update --app UUID 550e8400-... --name "Monthly" --access-level-id UUID --period monthly --ios-product-id com.example.monthly',
  ]
static flags = {
    ...appFlag,
    'access-level-id': Flags.string({description: 'Access level ID (UUID)', required: true}),
    'android-base-plan-id': Flags.string({description: 'Android base plan ID'}),
    'android-product-id': Flags.string({description: 'Android product ID'}),
    'ios-product-id': Flags.string({description: 'iOS product ID'}),
    name: Flags.string({description: 'Product name', required: true}),
    period: Flags.string({
      description: 'Subscription period (weekly, monthly, 2_months, 3_months, 6_months, yearly, lifetime)',
      required: true,
    }),
  }

  async run(): Promise<ProductResponse> {
    const {args, flags} = await this.parse(ProductsUpdate)

    if (!isValidUuid(args.product_id)) {
      this.error('Invalid product ID format.', {exit: 2})
    }

    if (!VALID_PERIODS.includes(flags.period)) {
      this.error(`Invalid period. Must be one of: ${VALID_PERIODS.join(', ')}`, {exit: 2})
    }

    if (!flags['ios-product-id'] && !flags['android-product-id']) {
      this.error('At least one of --ios-product-id or --android-product-id is required', {exit: 2})
    }

    if (flags['android-product-id'] && !flags['android-base-plan-id'] && flags.period !== 'lifetime') {
      this.error('--android-base-plan-id is required with --android-product-id for subscriptions', {exit: 2})
    }

    const client = await createAuthenticatedClient(this.config)

    const body: Record<string, unknown> = {
      access_level_id: flags['access-level-id'],
      name: flags.name,
      period: flags.period,
    }

    if (flags['ios-product-id']) body.ios_product_id = flags['ios-product-id']
    if (flags['android-product-id']) body.android_product_id = flags['android-product-id']
    if (flags['android-base-plan-id']) body.android_base_plan_id = flags['android-base-plan-id']

    const result = await client.put<ProductResponse>(`/apps/${flags.app}/products/${args.product_id}`, body)

    this.log('Product updated!')
    this.log(`ID: ${result.id}`)
    this.log(`Name: ${result.name}`)
    if (result.vendor_products.ios) {
      this.log(`iOS Product: ${result.vendor_products.ios.product_id}`)
    }

    if (result.vendor_products.android) {
      const bp = result.vendor_products.android.base_plan_id
      this.log(
        `Android Product: ${result.vendor_products.android.product_id}${bp ? ` (base plan: ${bp})` : ''}`,
      )
    }

    return result
  }
}
