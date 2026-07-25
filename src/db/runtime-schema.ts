import { userRecommendationSignalsCollection } from '../recommendations/user-signal-schema';
import { collections as baseCollections } from './schema';
import { CURRENT_SCHEMA_VERSION } from './runtime-schema-version';

export { CURRENT_SCHEMA_VERSION } from './runtime-schema-version';

type BaseCollection = (typeof baseCollections)[keyof typeof baseCollections];
type RuntimeCollection = Omit<BaseCollection, 'schema' | 'migrationStrategies'> & {
  schema: Omit<BaseCollection['schema'], 'version'> & { version: typeof CURRENT_SCHEMA_VERSION };
  migrationStrategies: Record<number, (doc: unknown) => unknown>;
};

function passThrough(doc: unknown): unknown {
  return doc;
}

function upgrade(collection: BaseCollection): RuntimeCollection {
  return {
    ...collection,
    schema: {
      ...collection.schema,
      version: CURRENT_SCHEMA_VERSION
    },
    migrationStrategies: {
      ...collection.migrationStrategies,
      [CURRENT_SCHEMA_VERSION]: passThrough
    }
  };
}

const upgradedBaseCollections = Object.fromEntries(
  Object.entries(baseCollections).map(([name, collection]) => [name, upgrade(collection)])
) as Record<keyof typeof baseCollections, RuntimeCollection>;

const runtimeUserRecommendationSignalsCollection = {
  ...userRecommendationSignalsCollection,
  schema: {
    ...userRecommendationSignalsCollection.schema,
    version: CURRENT_SCHEMA_VERSION
  },
  migrationStrategies: {
    1: passThrough,
    [CURRENT_SCHEMA_VERSION]: passThrough
  }
} as const;

export const collections = {
  ...upgradedBaseCollections,
  userrecommendationsignals: runtimeUserRecommendationSignalsCollection
};
