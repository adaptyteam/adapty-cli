import {readFile} from 'node:fs/promises'
import {join} from 'node:path'

/**
 * What currently handles purchases in the project:
 * - competitors (RevenueCat, Superwall, Qonversion)
 * - official/community store plugins (in_app_purchase, react-native-iap, ...)
 * - hand-rolled StoreKit / Google Play Billing code
 */
export type BillingId = 'native-store' | 'qonversion' | 'revenuecat' | 'store-plugin' | 'superwall'

export interface DetectedBilling {
  /** The specific tech matched, e.g. 'in_app_purchase', 'Google Play Billing'. */
  detail?: string
  id: BillingId
}

export const BILLING_LABELS: Record<BillingId, string> = {
  'native-store': 'custom StoreKit / Play Billing code',
  qonversion: 'Qonversion',
  revenuecat: 'RevenueCat',
  'store-plugin': 'the existing store plugin',
  superwall: 'Superwall',
}

/** Human label, using the matched tech when we have it: "the in_app_purchase plugin". */
export function billingLabel(billing: DetectedBilling): string {
  if (billing.id === 'store-plugin' && billing.detail) return `the ${billing.detail} plugin`
  if (billing.id === 'native-store' && billing.detail) return `custom ${billing.detail} code`
  return BILLING_LABELS[billing.id]
}

/**
 * Dependency manifests worth grepping, across all supported platforms.
 * Deliberately NOT pubspec.lock: lockfiles list transitive dependencies at
 * the same indentation as direct ones, which false-triggers plugin detection
 * (e.g. in_app_purchase pulled in by another plugin). Direct deps always
 * appear in pubspec.yaml.
 */
const MANIFESTS = [
  'package.json',
  'pubspec.yaml',
  'Podfile',
  'ios/Podfile',
  'Package.swift',
  'build.gradle',
  'build.gradle.kts',
  'app/build.gradle',
  'app/build.gradle.kts',
  'android/app/build.gradle',
  'android/app/build.gradle.kts',
  'Packages/manifest.json',
]

/** Xcode project files - the only manifest-level trace of a hand-rolled StoreKit integration. */
const PBXPROJ_HINTS = ['ios/Runner.xcodeproj/project.pbxproj', 'ios/App/App.xcodeproj/project.pbxproj']

/** Ordered: competitors first, then store plugins, then native store code. First match wins. */
const MATCHERS: Array<DetectedBilling & {re: RegExp}> = [
  {id: 'revenuecat', re: /revenuecat|react-native-purchases|purchases_flutter|purchases-capacitor|purchases-hybrid/i},
  {id: 'superwall', re: /superwall/i},
  {id: 'qonversion', re: /qonversion/i},
  {detail: 'in_app_purchase', id: 'store-plugin', re: /^\s+in_app_purchase\s*:/m},
  {detail: 'flutter_inapp_purchase', id: 'store-plugin', re: /flutter_inapp_purchase/},
  {detail: 'react-native-iap', id: 'store-plugin', re: /react-native-iap/},
  {detail: 'expo-in-app-purchases', id: 'store-plugin', re: /expo-in-app-purchases/},
  {detail: 'cordova-plugin-purchase', id: 'store-plugin', re: /cordova-plugin-purchase/},
  {detail: 'Unity IAP', id: 'store-plugin', re: /com\.unity\.purchasing/},
  {detail: 'Google Play Billing', id: 'native-store', re: /com\.android\.billingclient/},
  {detail: 'StoreKit', id: 'native-store', re: /StoreKit\.framework|import StoreKit/},
]

export async function detectBilling(dir: string): Promise<DetectedBilling | null> {
  const contents = await Promise.all(
    [...MANIFESTS, ...PBXPROJ_HINTS].map((rel) => readFile(join(dir, rel), 'utf8').catch(() => '')),
  )
  const blob = contents.join('\n')
  for (const {re, ...billing} of MATCHERS) {
    if (re.test(blob)) return billing
  }

  return null
}
