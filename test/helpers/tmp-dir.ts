/* eslint-disable mocha/no-exports -- shared fixture helper (registers hooks for its callers), not a test file */
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

/**
 * Fresh temp directory per test. Registers the mocha hooks once; call the
 * returned getter inside tests. One place owns the cleanup contract for
 * every fs-fixture suite.
 */
export function useTmpDir(prefix: string): () => string {
  let dir = ''

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), prefix))
  })

  afterEach(async () => {
    await rm(dir, {force: true, recursive: true})
  })

  return () => dir
}
