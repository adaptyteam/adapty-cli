import {Command, Flags} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag} from '../../lib/flags.js'
import {printResponse} from '../../lib/output.js'

const VALID_PERIODS = ['weekly', 'monthly', 'two_months', 'trimonthly', 'semiannual', 'annual', 'lifetime']

export default class ProductsCreate extends Command {
  static description = 'Create a product with vendor products per platform'
static enableJsonFlag = true
static examples = [
    '<%= config.bin %> products create --app UUID --title "Monthly" --access-level-id UUID --period monthly --ios-product-id com.example.monthly',
  ]
static flags = {
    ...appFlag,
    'access-level-id': Flags.string({description: 'Access level ID (UUID)', required: true}),
    'android-base-plan-id': Flags.string({description: 'Android base plan ID'}),
    'android-product-id': Flags.string({description: 'Android product ID'}),
    'ios-product-id': Flags.string({description: 'iOS product ID'}),
    period: Flags.string({
      description: 'Subscription period (weekly, monthly, two_months, trimonthly, semiannual, annual, lifetime)',
      required: true,
    }),
    title: Flags.string({description: 'Product title', required: true}),
  }

  async run(): Promise<Record<string, unknown>> {
    const {flags} = await this.parse(ProductsCreate)

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

    const result = await client.post<Record<string, unknown>>(`/apps/${flags.app}/products`, body)

    this.log('Product created!')
    printResponse(result, this.log.bind(this))

    return result
  }
}
