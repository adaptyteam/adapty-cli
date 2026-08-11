import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

export const mochaHooks = {
  async beforeAll() {
    process.env.XDG_CONFIG_HOME = await mkdtemp(join(tmpdir(), 'adapty-cli-config-'))
  },
}
