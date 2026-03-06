import {Args, Command} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, isValidUuid} from '../../lib/flags.js'

interface VendorProducts {
  android?: {base_plan_id?: string; id: string; product_id: string}
  ios?: {id: string; product_id: string}
}

interface ProductDetailResponse {
  access_level_id: string
  id: string
  name: string
  period: string
  vendor_products: VendorProducts
}

export default class ProductsGet extends Command {
  static args = {
    product_id: Args.string({description: 'Product ID (UUID)', required: true}),
  }
static description = 'Get product details'
static enableJsonFlag = true
static examples = ['<%= config.bin %> products get --app UUID 550e8400-e29b-41d4-a716-446655440000']
static flags = {
    ...appFlag,
  }

  async run(): Promise<ProductDetailResponse> {
    const {args, flags} = await this.parse(ProductsGet)

    if (!isValidUuid(args.product_id)) {
      this.error('Invalid product ID format.', {exit: 2})
    }

    const client = await createAuthenticatedClient(this.config)
    const result = await client.get<ProductDetailResponse>(`/apps/${flags.app}/products/${args.product_id}`)

    this.log(`ID: ${result.id}`)
    this.log(`Name: ${result.name}`)
    this.log(`Period: ${result.period}`)
    this.log(`Access Level ID: ${result.access_level_id}`)
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
