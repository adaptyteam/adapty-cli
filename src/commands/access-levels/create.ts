import {Command, Flags} from '@oclif/core'

import type {AccessLevelCreateRequestDTO, AccessLevelDTO} from '../../lib/api-schemas.js'

import {createAuthenticatedClient} from '../../lib/client-from-config.js'
import {appFlag} from '../../lib/flags.js'
import {printResponse} from '../../lib/output.js'

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

  async run(): Promise<AccessLevelDTO> {
    const {flags} = await this.parse(AccessLevelsCreate)
    const client = await createAuthenticatedClient(this.config)

    const body: AccessLevelCreateRequestDTO = {
      sdk_id: flags['sdk-id'],
      title: flags.title,
    }

    const result = await client.post<AccessLevelDTO>(`/apps/${flags.app}/access-levels`, body)

    this.log('Access level created!')
    printResponse(result as unknown as Record<string, unknown>, this.log.bind(this))

    return result
  }
}
