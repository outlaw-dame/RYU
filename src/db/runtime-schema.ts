import { userRecommendationSignalsCollection } from '../recommendations/user-signal-rxdb';
import { collections as baseCollections } from './schema';
import { CURRENT_SCHEMA_VERSION } from './runtime-schema-version';

export { CURRENT_SCHEMA_VERSION } from './runtime-schema-version';

const allCollections = {
  ...baseCollections,
  userrecommendationsignals: userRecommendationSignalsCollection
} as const;

type BaseCollection = (typeof allCollections)[keyof typeof allCollections];
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
  } as RuntimeCollection;
}

const entries = Object.entries(allCollections).map(([name, collection]) => [name, upgrade(collection)]);

export const collections = Object.fromEntries(entries) as Record<keyof typeof allCollections, RuntimeCollection>;
