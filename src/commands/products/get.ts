import {Args, Command} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, isValidUuid} from '../../lib/flags.js'
import {printResponse} from '../../lib/output.js'

interface ProductDetailResponse {
  access_level_id: string
  id: string
  period: string
  title: string
  vendor_products: Record<string, unknown>
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

    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))

    return result
  }
}
