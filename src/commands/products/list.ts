import {Command} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, type PaginatedResponse, paginationFlags, paginationParams} from '../../lib/flags.js'
import {printList} from '../../lib/output.js'

interface VendorProducts {
  android?: {base_plan_id?: string; id: string; product_id: string}
  ios?: {id: string; product_id: string}
}

interface ProductItem {
  id: string
  name: string
  vendor_products: VendorProducts
}

export default class ProductsList extends Command {
  static description = 'List products for an app'
static enableJsonFlag = true
static examples = ['<%= config.bin %> products list --app 550e8400-...']
static flags = {
    ...appFlag,
    ...paginationFlags,
  }

  async run(): Promise<PaginatedResponse<ProductItem>> {
    const {flags} = await this.parse(ProductsList)
    const client = await createAuthenticatedClient(this.config)
    const result = await client.get<PaginatedResponse<ProductItem>>(
      `/apps/${flags.app}/products`,
      paginationParams(flags),
    )

    printList(
      result.data.map((p) => {
        const row: Record<string, unknown> = {ID: p.id, Name: p.name}
        if (p.vendor_products.ios) row['iOS Product'] = p.vendor_products.ios.product_id
        if (p.vendor_products.android) {
          const bp = p.vendor_products.android.base_plan_id
          row['Android Product'] = bp
            ? `${p.vendor_products.android.product_id} (base plan: ${bp})`
            : p.vendor_products.android.product_id
        }

        return row
      }),
      this.log.bind(this),
      result.meta.pagination,
    )

    return result
  }
}
