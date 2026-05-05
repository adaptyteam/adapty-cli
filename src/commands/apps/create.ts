import {Command, Flags} from '@oclif/core'

import type {AccessLevelDTO, AppCreateRequestDTO, AppSummaryDTO} from '../../lib/api-schemas.js'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {printResponse} from '../../lib/output.js'

interface AccessLevelsResponse {
  items?: AccessLevelDTO[]
}

export default class AppsCreate extends Command {
  static description = 'Create a new Adapty app'
static enableJsonFlag = true
static examples = [
    '<%= config.bin %> apps create --title "My App" --platform ios --apple-bundle-id com.example.app',
    '<%= config.bin %> apps create --title "My App" --platform ios --platform android --apple-bundle-id com.example.app --google-bundle-id com.example.app',
  ]
static flags = {
    'apple-bundle-id': Flags.string({description: 'Apple bundle ID (required with --platform ios)'}),
    'google-bundle-id': Flags.string({description: 'Google bundle ID (required with --platform android)'}),
    platform: Flags.string({
      description: 'Platform (ios, android). Repeat for multiple.',
      multiple: true,
      options: ['ios', 'android'],
      required: true,
    }),
    title: Flags.string({description: 'App title', required: true}),
  }

  async run(): Promise<AppSummaryDTO> {
    const {flags} = await this.parse(AppsCreate)

    if (flags.platform.includes('ios') && !flags['apple-bundle-id']) {
      this.error('--apple-bundle-id is required when --platform ios is specified', {exit: 2})
    }

    if (flags.platform.includes('android') && !flags['google-bundle-id']) {
      this.error('--google-bundle-id is required when --platform android is specified', {exit: 2})
    }

    const client = await createAuthenticatedClient(this.config)

    const body: AppCreateRequestDTO & {platforms: string[]} = {
      platforms: flags.platform,
      title: flags.title,
    }

    if (flags['apple-bundle-id']) body.apple_bundle_id = flags['apple-bundle-id']
    if (flags['google-bundle-id']) body.google_bundle_id = flags['google-bundle-id']

    const result = await client.post<AppSummaryDTO>('/apps', body)

    this.log('App created!')
    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))

    try {
      const accessLevels = await client.get<AccessLevelsResponse>(`/apps/${result.id}/access-levels`)
      if (accessLevels.items?.length) {
        this.log('\nDefault access level:')
        printResponse(accessLevels.items[0] as unknown as Record<string, unknown>, this.log.bind(this))
      }
    } catch {
      this.warn('Could not fetch access levels for new app')
    }

    return result
  }
}
