/** The door of the Retention Messaging resource: re-exports only, no code of its own. */
export { changeIconPaths, validateChangeShape } from './change.js';
export { validateMessageChange } from './conflicts.js';
export { createIconPaths, planCreate, validateCreateFile, validateCreateImages } from './create.js';
export { messageForm } from './form.js';
export { RETENTION_IMAGE_MAX_BYTES, validateRetentionImage } from './image.js';
export {
    retentionMessageStates,
    retentionMessageTypes,
    retentionModes,
    retentionOrderings,
    retentionStatusActions,
} from './model.js';
export { retentionMessaging } from './resource.js';
export { planUpdate, validateUpdateImages } from './update.js';

export type { BulletChange, LocalizationChange, MessageChange, ProductChange } from './change.js';
export type { CreateMessageFile, CreateMessageImages } from './create.js';
export type {
    ImageFile,
    MessageWritePlan,
    PlanSwitchSuggestions,
    ProductSuggestions,
    PromoOfferSuggestions,
    RealtimeUrl,
    RetentionMessage,
    RetentionMessageAnswer,
    RetentionMessageList,
    RetentionMode,
    RetentionSetupStatus,
    RetentionStatusAction,
} from './model.js';
export type { RetentionMessagingApi } from './resource.js';
export type { UpdateMessageImages } from './update.js';
