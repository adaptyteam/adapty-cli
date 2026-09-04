import {expect} from 'chai'
import {mkdir, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {loadMigrationReference} from '../../../src/lib/agent/skill-source.js'
import {useTmpDir} from '../../helpers/tmp-dir.js'

/**
 * These exercise the real loader through ADAPTY_SKILL_DIR rather than stubbing
 * fetch, so the "file is absent" branch is hit the same way a developer working
 * against a local checkout would hit it.
 */
describe('loadMigrationReference', () => {
  const tmp = useTmpDir('adapty-skill-')
  let previous: string | undefined

  beforeEach(async () => {
    await mkdir(join(tmp(), 'references'), {recursive: true})
    previous = process.env.ADAPTY_SKILL_DIR
    process.env.ADAPTY_SKILL_DIR = tmp()
  })

  afterEach(() => {
    if (previous === undefined) delete process.env.ADAPTY_SKILL_DIR
    else process.env.ADAPTY_SKILL_DIR = previous
  })

  const write = (name: string, body: string) => writeFile(join(tmp(), 'references', name), body, 'utf8')

  it('returns the spine alone when the source has no dedicated file', async () => {
    await write('migration.md', 'SPINE RULES')
    expect(await loadMigrationReference('superwall')).to.equal('SPINE RULES')
  })

  it('returns the spine alone when no source is given', async () => {
    await write('migration.md', 'SPINE RULES')
    expect(await loadMigrationReference()).to.equal('SPINE RULES')
  })

  it('appends the source file when the skill ships one', async () => {
    await write('migration.md', 'SPINE RULES')
    await write('migration-revenuecat.md', 'RC SPECIFICS')
    const reference = await loadMigrationReference('revenuecat')
    expect(reference).to.include('SPINE RULES')
    expect(reference).to.include('RC SPECIFICS')
    expect(reference.indexOf('SPINE RULES')).to.be.lessThan(reference.indexOf('RC SPECIFICS'))
  })

  it('strips frontmatter from both files', async () => {
    await write('migration.md', '---\nname: migration\n---\n\nSPINE RULES')
    await write('migration-revenuecat.md', '---\nx: y\n---\n\nRC SPECIFICS')
    const reference = await loadMigrationReference('revenuecat')
    expect(reference).to.not.include('name: migration')
    expect(reference).to.not.include('x: y')
    expect(reference).to.include('SPINE RULES')
    expect(reference).to.include('RC SPECIFICS')
  })

  // The spine is not optional: it carries the mapping rules and the
  // ADAPTY_SETUP.md contract the migrate prompt stopped inlining, so losing it
  // silently would put us back where we started.
  it('throws when the spine itself is missing', async () => {
    await loadMigrationReference('revenuecat').then(
      () => expect.fail('expected a missing spine to reject'),
      (error: unknown) => expect(error).to.be.an('error'),
    )
  })
})
