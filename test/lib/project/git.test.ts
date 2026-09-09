import {expect} from 'chai'
import {execFile} from 'node:child_process'
import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {promisify} from 'node:util'

import {availableBranchName, createBranch, hasUncommittedChanges, isGitRepo} from '../../../src/lib/project/git.js'
import {useTmpDir} from '../../helpers/tmp-dir.js'

const execFileAsync = promisify(execFile)
const tmp = useTmpDir('adapty-git-')

/** A repo with one commit, independent of the machine's git identity and signing config. */
async function initRepo(dir: string): Promise<void> {
  await execFileAsync('git', ['-C', dir, 'init', '-q'])
  await writeFile(join(dir, 'README.md'), '# fixture\n')
  await execFileAsync('git', ['-C', dir, 'add', '-A'])
  await execFileAsync('git', [
    '-C',
    dir,
    '-c',
    'user.email=test@example.com',
    '-c',
    'user.name=Test',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-qm',
    'init',
  ])
}

async function head(dir: string): Promise<string> {
  const {stdout} = await execFileAsync('git', ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'])
  return stdout.trim()
}

describe('git helpers', () => {
  it('reports a plain directory as no repo, and an initialized one as a repo', async () => {
    expect(await isGitRepo(tmp())).to.equal(false)
    await initRepo(tmp())
    expect(await isGitRepo(tmp())).to.equal(true)
  })

  it('sees uncommitted changes only when there are some', async () => {
    await initRepo(tmp())
    expect(await hasUncommittedChanges(tmp())).to.equal(false)
    await writeFile(join(tmp(), 'pubspec.yaml'), 'name: demo\n')
    expect(await hasUncommittedChanges(tmp())).to.equal(true)
  })

  it('treats a directory outside git as having nothing to protect', async () => {
    await writeFile(join(tmp(), 'pubspec.yaml'), 'name: demo\n')
    expect(await hasUncommittedChanges(tmp())).to.equal(false)
  })

  it('suffixes the branch name when a previous run already took it', async () => {
    await initRepo(tmp())
    expect(await availableBranchName(tmp(), 'adapty-integrate')).to.equal('adapty-integrate')

    expect(await createBranch(tmp(), 'adapty-integrate')).to.equal(true)
    expect(await head(tmp())).to.equal('adapty-integrate')
    expect(await availableBranchName(tmp(), 'adapty-integrate')).to.equal('adapty-integrate-2')

    await createBranch(tmp(), 'adapty-integrate-2')
    expect(await availableBranchName(tmp(), 'adapty-integrate')).to.equal('adapty-integrate-3')
  })

  it('reports failure instead of throwing when the branch cannot be created', async () => {
    await initRepo(tmp())
    await createBranch(tmp(), 'adapty-migrate')
    // Same name twice: git refuses, and the caller keeps the current branch.
    expect(await createBranch(tmp(), 'adapty-migrate')).to.equal(false)
    expect(await head(tmp())).to.equal('adapty-migrate')
  })
})
