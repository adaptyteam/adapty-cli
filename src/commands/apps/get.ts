import {Args, Command} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {isValidUuid} from '../../lib/output.js'

interface AppDetailResponse {
  android_bundle_id?: string
  id: string
  ios_bundle_id?: string
  name: string
  platforms: string[]
  sdk_key: string
  secret_key: string
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

    this.log(`ID: ${result.id}`)
    this.log(`Name: ${result.name}`)
    this.log(`SDK Key: ${result.sdk_key}`)
    this.log(`Secret Key: ${result.secret_key}`)
    this.log(`Platforms: ${result.platforms.join(', ')}`)
    if (result.ios_bundle_id) this.log(`iOS Bundle ID: ${result.ios_bundle_id}`)
    if (result.android_bundle_id) this.log(`Android Bundle ID: ${result.android_bundle_id}`)

    return result
  }
}
