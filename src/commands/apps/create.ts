import {Command, Flags} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'

interface AppCreateResponse {
  app: {id: string; name: string; sdk_key: string}
  default_access_level: {id: string; sdk_id: string}
}

export default class AppsCreate extends Command {
  static description = 'Create a new Adapty app'
static enableJsonFlag = true
static examples = [
    '<%= config.bin %> apps create --name "My App" --platform ios --ios-bundle-id com.example.app',
    '<%= config.bin %> apps create --name "My App" --platform ios --platform android --ios-bundle-id com.example.app --android-bundle-id com.example.app',
  ]
static flags = {
    'android-bundle-id': Flags.string({description: 'Android bundle ID (required with --platform android)'}),
    'ios-bundle-id': Flags.string({description: 'iOS bundle ID (required with --platform ios)'}),
    name: Flags.string({description: 'App name', required: true}),
    platform: Flags.string({
      description: 'Platform (ios, android). Repeat for multiple.',
      multiple: true,
      options: ['ios', 'android'],
      required: true,
    }),
  }

  async run(): Promise<AppCreateResponse> {
    const {flags} = await this.parse(AppsCreate)

    if (flags.platform.includes('ios') && !flags['ios-bundle-id']) {
      this.error('--ios-bundle-id is required when --platform ios is specified', {exit: 2})
    }

    if (flags.platform.includes('android') && !flags['android-bundle-id']) {
      this.error('--android-bundle-id is required when --platform android is specified', {exit: 2})
    }

    const client = await createAuthenticatedClient(this.config)

    const body: Record<string, unknown> = {
      app_name: flags.name,
      platforms: flags.platform,
    }

    if (flags['ios-bundle-id']) body.ios_bundle_id = flags['ios-bundle-id']
    if (flags['android-bundle-id']) body.android_bundle_id = flags['android-bundle-id']

    const result = await client.post<AppCreateResponse>('/apps', body)

    this.log('App created!')
    this.log(`ID: ${result.app.id}`)
    this.log(`Name: ${result.app.name}`)
    this.log(`SDK Key: ${result.app.sdk_key}`)
    this.log(`Default Access Level ID: ${result.default_access_level.id}`)
    this.log(`Default Access Level SDK ID: ${result.default_access_level.sdk_id}`)

    return result
  }
}
