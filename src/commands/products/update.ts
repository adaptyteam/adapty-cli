import {Args, Command, Flags} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag, isValidUuid} from '../../lib/flags.js'
import {printResponse} from '../../lib/output.js'


export default class ProductsUpdate extends Command {
  static args = {
    product_id: Args.string({description: 'Product ID (UUID)', required: true}),
  }
static description = 'Update a product (title and access level only)'
static enableJsonFlag = true
static examples = [
    '<%= config.bin %> products update --app UUID 550e8400-... --title "Monthly" --access-level-id UUID',
  ]
static flags = {
    ...appFlag,
    'access-level-id': Flags.string({description: 'Access level ID (UUID)', required: true}),
    title: Flags.string({description: 'Product title', required: true}),
  }

  async run(): Promise<Record<string, unknown>> {
    const {args, flags} = await this.parse(ProductsUpdate)

    if (!isValidUuid(args.product_id)) {
      this.error('Invalid product ID format.', {exit: 2})
    }

    const client = await createAuthenticatedClient(this.config)

    const body: Record<string, unknown> = {
      access_level_id: flags['access-level-id'],
      title: flags.title,
    }

    const result = await client.put<Record<string, unknown>>(`/apps/${flags.app}/products/${args.product_id}`, body)

    this.log('Product updated!')
    printResponse(result, this.log.bind(this))

    return result
  }
}
