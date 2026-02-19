import {Command, Flags} from '@oclif/core'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag} from '../../lib/flags.js'
import {isValidUuid} from '../../lib/output.js'

interface AccessLevelResponse {
  id: string
  sdk_id: string
  title: string
}

export default class AccessLevelsCreate extends Command {
  static description = 'Create a custom access level'
static enableJsonFlag = true
static examples = [
    '<%= config.bin %> access-levels create --app 550e8400-... --sdk-id vip --title "VIP Access"',
  ]
static flags = {
    ...appFlag,
    'sdk-id': Flags.string({description: 'Access level SDK identifier', required: true}),
    title: Flags.string({description: 'Access level title', required: true}),
  }

  async run(): Promise<AccessLevelResponse> {
    const {flags} = await this.parse(AccessLevelsCreate)

    if (!isValidUuid(flags.app)) {
      this.error('Invalid app ID format. Run `adapty apps list` to find your app ID.', {exit: 2})
    }

    const client = await createAuthenticatedClient(this.config)
    const result = await client.post<AccessLevelResponse>(`/apps/${flags.app}/access-levels`, {
      sdk_id: flags['sdk-id'],
      title: flags.title,
    })

    this.log('Access level created!')
    this.log(`ID: ${result.id}`)
    this.log(`SDK ID: ${result.sdk_id}`)
    this.log(`Title: ${result.title}`)

    return result
  }
}
