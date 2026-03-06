import {Args, Command, Flags} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {isValidUuid} from '../../lib/flags.js'

interface AppResponse {
  android_bundle_id?: string
  id: string
  ios_bundle_id?: string
  name: string
}

export default class AppsUpdate extends Command {
  static args = {
    app_id: Args.string({description: 'App ID (UUID)', required: true}),
  }
static description = 'Update an app'
static enableJsonFlag = true
static examples = ['<%= config.bin %> apps update 550e8400-... --name "My App"']
static flags = {
    'android-bundle-id': Flags.string({description: 'Android bundle ID'}),
    'ios-bundle-id': Flags.string({description: 'iOS bundle ID'}),
    name: Flags.string({description: 'App name'}),
  }

  async run(): Promise<AppResponse> {
    const {args, flags} = await this.parse(AppsUpdate)

    if (!isValidUuid(args.app_id)) {
      this.error('Invalid app ID format. Run `adapty apps list` to find your app ID.', {exit: 2})
    }

    if (!flags.name && !flags['ios-bundle-id'] && !flags['android-bundle-id']) {
      this.error('At least one of --name, --ios-bundle-id, or --android-bundle-id is required', {exit: 2})
    }

    const client = await createAuthenticatedClient(this.config)

    const body: Record<string, unknown> = {}
    if (flags.name) body.name = flags.name
    if (flags['ios-bundle-id']) body.ios_bundle_id = flags['ios-bundle-id']
    if (flags['android-bundle-id']) body.android_bundle_id = flags['android-bundle-id']

    const result = await client.put<AppResponse>(`/apps/${args.app_id}`, body)

    this.log('App updated!')
    this.log(`ID: ${result.id}`)
    this.log(`Name: ${result.name}`)
    if (result.ios_bundle_id) this.log(`iOS Bundle ID: ${result.ios_bundle_id}`)
    if (result.android_bundle_id) this.log(`Android Bundle ID: ${result.android_bundle_id}`)

    return result
  }
}
