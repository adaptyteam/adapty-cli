/** The door of the virtual-currencies resource: re-exports only, no code of its own. */
export { validateCreateVirtualCurrency } from './create.js';
export { validateMappingItems } from './mappings.js';
export { virtualCurrencies } from './resource.js';
export { validateProfileAddress } from './transactions.js';
export { validateUpdateVirtualCurrency } from './update.js';

export type { CreateVirtualCurrencyInput } from './create.js';
export type {
    MappingChanges,
    MappingItem,
    OneTimeMapping,
    SubscriptionMapping,
    UpsertedMappings,
    VirtualCurrency,
    VirtualCurrencyDetail,
    VirtualCurrencyList,
    VirtualCurrencyMapping,
    WriteToken,
} from './model.js';
export type { VirtualCurrenciesApi } from './resource.js';
export type {
    Balance,
    Balances,
    CursorPagination,
    ExpiringAmount,
    LedgerItem,
    LedgerPage,
    LedgerQuery,
    LedgerRow,
    ProfileAddress,
} from './transactions.js';
export type { UpdateVirtualCurrencyInput } from './update.js';
