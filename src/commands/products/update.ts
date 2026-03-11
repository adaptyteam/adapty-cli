import {Args, Command, Flags} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, isValidUuid} from '../../lib/flags.js'
import {printResponse} from '../../lib/output.js'

const VALID_PERIODS = ['weekly', 'monthly', '2_months', '3_months', '6_months', 'yearly', 'lifetime']

export default class ProductsUpdate extends Command {
  static args = {
    product_id: Args.string({description: 'Product ID (UUID)', required: true}),
  }
static description = 'Update a product'
static enableJsonFlag = true
static examples = [
    '<%= config.bin %> products update --app UUID 550e8400-... --title "Monthly" --access-level-id UUID --period monthly --ios-product-id com.example.monthly',
  ]
static flags = {
    ...appFlag,
    'access-level-id': Flags.string({description: 'Access level ID (UUID)', required: true}),
    'android-base-plan-id': Flags.string({description: 'Android base plan ID'}),
    'android-product-id': Flags.string({description: 'Android product ID'}),
    'ios-product-id': Flags.string({description: 'iOS product ID'}),
    period: Flags.string({
      description: 'Subscription period (weekly, monthly, 2_months, 3_months, 6_months, yearly, lifetime)',
      required: true,
    }),
    title: Flags.string({description: 'Product title', required: true}),
  }

  async run(): Promise<Record<string, unknown>> {
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
      period: flags.period,
      title: flags.title,
    }

    if (flags['ios-product-id']) body.ios_product_id = flags['ios-product-id']
    if (flags['android-product-id']) body.android_product_id = flags['android-product-id']
    if (flags['android-base-plan-id']) body.android_base_plan_id = flags['android-base-plan-id']

    const result = await client.put<Record<string, unknown>>(`/apps/${flags.app}/products/${args.product_id}`, body)

    this.log('Product updated!')
    printResponse(result, this.log.bind(this))

    return result
  }
}
