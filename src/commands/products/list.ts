import {Command} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, type PaginatedResponse, paginationFlags, paginationParams} from '../../lib/flags.js'
import {printList} from '../../lib/output.js'

interface ProductItem {
  id: string
  title: string
  vendor_products: Record<string, unknown>
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

    printList(result.data as unknown as Record<string, unknown>[], this.log.bind(this), result.meta.pagination)

    return result
  }
}
