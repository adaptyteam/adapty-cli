import {expect} from 'chai'
import {mkdir, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {scanProject} from '../../../src/lib/project/scan.js'
import {useTmpDir} from '../../helpers/tmp-dir.js'

describe('project scan', () => {
  const dir = useTmpDir('adapty-scan-')

  it('detects a Flutter app and takes its name from pubspec', async () => {
    await writeFile(join(dir(), 'pubspec.yaml'), 'name: date_planner\ndescription: x\n')
    const project = await scanProject(dir())
    expect(project).to.include({name: 'date_planner', platform: 'flutter', platformLabel: 'Flutter'})
    expect(project?.path).to.equal(dir())
  })

  it('detects React Native via the package.json dependency', async () => {
    await writeFile(join(dir(), 'package.json'), JSON.stringify({dependencies: {'react-native': '0.75.0'}, name: 'rn'}))
    expect((await scanProject(dir()))?.platform).to.equal('react-native')
  })

  it('detects Capacitor over plain web', async () => {
    await writeFile(
      join(dir(), 'package.json'),
      JSON.stringify({dependencies: {'@capacitor/core': '6.0.0'}, name: 'cap'}),
    )
    expect((await scanProject(dir()))?.platform).to.equal('capacitor')
  })

  it('detects iOS and takes the app name from the xcodeproj', async () => {
    await mkdir(join(dir(), 'MagicApp.xcodeproj'))
    const project = await scanProject(dir())
    expect(project).to.include({name: 'MagicApp', platform: 'ios'})
  })

  it('detects Unity even when the export ships gradle files', async () => {
    await mkdir(join(dir(), 'Assets'))
    await mkdir(join(dir(), 'ProjectSettings'))
    await writeFile(join(dir(), 'build.gradle'), '')
    expect((await scanProject(dir()))?.platform).to.equal('unity')
  })

  it('detects a gradle project as Android', async () => {
    await writeFile(join(dir(), 'settings.gradle'), '')
    await writeFile(join(dir(), 'build.gradle'), '')
    expect((await scanProject(dir()))?.platform).to.equal('android')
  })

  it('detects KMP (commonMain module) instead of plain Android', async () => {
    await writeFile(join(dir(), 'settings.gradle.kts'), '')
    await writeFile(join(dir(), 'build.gradle.kts'), '')
    await mkdir(join(dir(), 'shared', 'src', 'commonMain'), {recursive: true})
    expect((await scanProject(dir()))?.platform).to.equal('kmp')
  })

  it('returns null for a directory with no mobile project', async () => {
    await writeFile(join(dir(), 'README.md'), 'hi')
    expect(await scanProject(dir())).to.equal(null)
  })
})
