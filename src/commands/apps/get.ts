import {Args, Command} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {isValidUuid} from '../../lib/flags.js'
import {printResponse} from '../../lib/output.js'

interface AppDetailResponse {
  apple_bundle_id?: string
  google_bundle_id?: string
  id: string
  platforms: string[]
  sdk_key: string
  secret_key: string
  title: string
}

export default class AppsGet extends Command {
  static args = {
    app_id: Args.string({description: 'App ID (UUID)', required: true}),
  }
static description = 'Get app details'
static enableJsonFlag = true
static examples = ['<%= config.bin %> apps get 550e8400-e29b-41d4-a716-446655440000']

  async run(): Promise<AppDetailResponse> {
    const {args} = await this.parse(AppsGet)

    if (!isValidUuid(args.app_id)) {
      this.error('Invalid app ID format. Run `adapty apps list` to find your app ID.', {exit: 2})
    }

    const client = await createAuthenticatedClient(this.config)
    const result = await client.get<AppDetailResponse>(`/apps/${args.app_id}`)

    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))

    return result
  }
}
