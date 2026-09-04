import {execFile} from 'node:child_process'
import {promisify} from 'node:util'

const execFileAsync = promisify(execFile)

/** Run git in `dir`. null = git failed (not a repo, git missing, ref absent) - every caller treats that as "no". */
async function git(dir: string, args: string[]): Promise<null | string> {
  try {
    const {stdout} = await execFileAsync('git', ['-C', dir, ...args], {timeout: 5000})
    return stdout.trim()
  } catch {
    return null
  }
}

export async function isGitRepo(dir: string): Promise<boolean> {
  return (await git(dir, ['rev-parse', '--is-inside-work-tree'])) === 'true'
}

/** Uncommitted changes present? Outside a git repo -> false (nothing to protect). */
export async function hasUncommittedChanges(dir: string): Promise<boolean> {
  const status = await git(dir, ['status', '--porcelain'])
  return status !== null && status.length > 0
}

async function branchExists(dir: string, name: string): Promise<boolean> {
  return (await git(dir, ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`])) !== null
}

/** `base`, or `base-2`, `base-3`, ... when taken - a second run must never collide with the first one's branch. */
export async function availableBranchName(dir: string, base: string): Promise<string> {
  if (!(await branchExists(dir, base))) return base

  for (let n = 2; n <= 20; n++) {
    const candidate = `${base}-${n}`
    // Sequential on purpose: names are tried in order and the first free one wins.
    if (!(await branchExists(dir, candidate))) return candidate
  }

  return `${base}-${Date.now()}`
}

/** Create and switch to `name`. false = git refused; the caller stays on the current branch. */
export async function createBranch(dir: string, name: string): Promise<boolean> {
  return (await git(dir, ['checkout', '-b', name])) !== null
}
