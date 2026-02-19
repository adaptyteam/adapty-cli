import {Command} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, paginationFlags, paginationParams} from '../../lib/flags.js'
import {isValidUuid, printList} from '../../lib/output.js'

interface VendorProducts {
  android?: {base_plan_id?: string; id: string; product_id: string}
  ios?: {id: string; product_id: string}
}

interface ProductItem {
  id: string
  name: string
  vendor_products: VendorProducts
}

interface PaginatedResponse {
  data: ProductItem[]
  meta: {pagination: {count: number; page: number; pages: number}}
}

export default class ProductsList extends Command {
  static description = 'List products for an app'
static enableJsonFlag = true
static examples = ['<%= config.bin %> products list --app 550e8400-...']
static flags = {
    ...appFlag,
    ...paginationFlags,
  }

  async run(): Promise<PaginatedResponse> {
    const {flags} = await this.parse(ProductsList)

    if (!isValidUuid(flags.app)) {
      this.error('Invalid app ID format. Run `adapty apps list` to find your app ID.', {exit: 2})
    }

    const client = await createAuthenticatedClient(this.config)
    const result = await client.get<PaginatedResponse>(
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
