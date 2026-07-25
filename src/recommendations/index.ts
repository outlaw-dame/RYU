export {
  USER_SIGNAL_ENTITY_TYPES,
  USER_SIGNAL_PROVENANCE,
  USER_SIGNAL_SCHEMA_VERSION,
  USER_SIGNAL_TYPES,
  type UserRecommendationSignalDoc,
  type UserSignalEntityType,
  type UserSignalProvenance,
  type UserSignalType
} from "./user-signal-schema";

export { userRecommendationSignalsCollection } from "./user-signal-rxdb";

export {
  buildUserSignalId,
  compareUserSignalPrecedence,
  createUserSignal,
  isUserSignalExpired,
  normalizeInstanceOrigin,
  selectEffectiveUserSignal,
  type UserSignalInput
} from "./user-signals";
