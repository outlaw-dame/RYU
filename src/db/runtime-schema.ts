import { collections as baseCollections } from './schema';

export const CURRENT_SCHEMA_VERSION = 2;

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

const entries = Object.entries(baseCollections).map(([name, collection]) => [name, upgrade(collection)]);

export const collections = Object.fromEntries(entries) as Record<keyof typeof baseCollections, RuntimeCollection>;
