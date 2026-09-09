import {expect} from 'chai'
import {mkdir, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {billingLabel, detectBilling} from '../../../src/lib/project/billing.js'
import {useTmpDir} from '../../helpers/tmp-dir.js'

describe('billing detection', () => {
  const dir = useTmpDir('adapty-billing-')

  it('detects RevenueCat from purchases_flutter in pubspec', async () => {
    await writeFile(join(dir(), 'pubspec.yaml'), 'dependencies:\n  purchases_flutter: ^10.0.0\n')
    const billing = await detectBilling(dir())
    expect(billing?.id).to.equal('revenuecat')
    expect(billingLabel(billing!)).to.equal('RevenueCat')
  })

  it('detects Superwall from package.json', async () => {
    await writeFile(
      join(dir(), 'package.json'),
      JSON.stringify({dependencies: {'@superwall/react-native-superwall': '2.0.0'}}),
    )
    expect((await detectBilling(dir()))?.id).to.equal('superwall')
  })

  it('detects the official in_app_purchase plugin with any indentation', async () => {
    await writeFile(join(dir(), 'pubspec.yaml'), 'dependencies:\n    in_app_purchase: ^3.2.0\n')
    const billing = await detectBilling(dir())
    expect(billing?.id).to.equal('store-plugin')
    expect(billingLabel(billing!)).to.equal('the in_app_purchase plugin')
  })

  it('ignores a transitive in_app_purchase that only appears in pubspec.lock', async () => {
    await writeFile(join(dir(), 'pubspec.yaml'), 'dependencies:\n  some_plugin: ^1.0.0\n')
    await writeFile(
      join(dir(), 'pubspec.lock'),
      'packages:\n  in_app_purchase:\n    dependency: transitive\n    version: "3.2.0"\n',
    )
    expect(await detectBilling(dir())).to.equal(null)
  })

  it('detects Google Play Billing from gradle', async () => {
    await writeFile(
      join(dir(), 'build.gradle'),
      'dependencies { implementation "com.android.billingclient:billing:7.0.0" }',
    )
    const billing = await detectBilling(dir())
    expect(billing?.id).to.equal('native-store')
    expect(billingLabel(billing!)).to.equal('custom Google Play Billing code')
  })

  it('detects StoreKit linked in the Xcode project', async () => {
    await mkdir(join(dir(), 'ios', 'Runner.xcodeproj'), {recursive: true})
    await writeFile(join(dir(), 'ios', 'Runner.xcodeproj', 'project.pbxproj'), '... StoreKit.framework ...')
    expect((await detectBilling(dir()))?.detail).to.equal('StoreKit')
  })

  it('competitor detection wins over a store plugin in the same project', async () => {
    await writeFile(
      join(dir(), 'pubspec.yaml'),
      'dependencies:\n  purchases_flutter: ^10.0.0\n  in_app_purchase: ^3.2.0\n',
    )
    expect((await detectBilling(dir()))?.id).to.equal('revenuecat')
  })

  it('returns null for a clean project', async () => {
    await writeFile(join(dir(), 'pubspec.yaml'), 'dependencies:\n  provider: ^6.0.0\n')
    expect(await detectBilling(dir())).to.equal(null)
  })
})
