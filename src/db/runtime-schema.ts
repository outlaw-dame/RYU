import { collections as baseCollections } from './schema';

export const CURRENT_SCHEMA_VERSION = 2;

type BaseCollection = (typeof baseCollections)[keyof typeof baseCollections];

function passThrough(doc: unknown): unknown {
  return doc;
}

function upgrade(collection: BaseCollection): BaseCollection {
  const nextStrategies = {
    ...collection.migrationStrategies,
    [CURRENT_SCHEMA_VERSION]: passThrough
  };

  return {
    ...collection,
    schema: {
      ...collection.schema,
      version: CURRENT_SCHEMA_VERSION
    },
    migrationStrategies: nextStrategies
  } as BaseCollection;
}

const entries = Object.entries(baseCollections).map(([name, collection]) => [name, upgrade(collection)]);

export const collections = Object.fromEntries(entries) as Record<keyof typeof baseCollections, BaseCollection>;
