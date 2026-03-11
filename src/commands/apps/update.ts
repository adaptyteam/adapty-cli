import {Args, Command, Flags} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {isValidUuid} from '../../lib/flags.js'
import {printResponse} from '../../lib/output.js'

interface AppResponse {
  apple_bundle_id?: string
  google_bundle_id?: string
  id: string
  title: string
}

export default class AppsUpdate extends Command {
  static args = {
    app_id: Args.string({description: 'App ID (UUID)', required: true}),
  }
static description = 'Update an app'
static enableJsonFlag = true
static examples = ['<%= config.bin %> apps update 550e8400-... --title "My App"']
static flags = {
    'apple-bundle-id': Flags.string({description: 'Apple bundle ID'}),
    'google-bundle-id': Flags.string({description: 'Google bundle ID'}),
    title: Flags.string({description: 'App title'}),
  }

  async run(): Promise<AppResponse> {
    const {args, flags} = await this.parse(AppsUpdate)

    if (!isValidUuid(args.app_id)) {
      this.error('Invalid app ID format. Run `adapty apps list` to find your app ID.', {exit: 2})
    }

    if (!flags.title && !flags['apple-bundle-id'] && !flags['google-bundle-id']) {
      this.error('At least one of --title, --apple-bundle-id, or --google-bundle-id is required', {exit: 2})
    }

    const client = await createAuthenticatedClient(this.config)

    const body: Record<string, unknown> = {}
    if (flags.title) body.title = flags.title
    if (flags['apple-bundle-id']) body.apple_bundle_id = flags['apple-bundle-id']
    if (flags['google-bundle-id']) body.google_bundle_id = flags['google-bundle-id']

    const result = await client.put<AppResponse>(`/apps/${args.app_id}`, body)

    this.log('App updated!')
    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))

    return result
  }
}
