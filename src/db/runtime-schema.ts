import { collections as baseCollections } from './schema';

export const CURRENT_SCHEMA_VERSION = 2;

function passThrough(doc: unknown): unknown {
  return doc;
}

function upgrade(collection: any): any {
  return {
    ...collection,
    schema: {
      ...collection.schema,
      version: CURRENT_SCHEMA_VERSION
    },
    migrationStrategies: {
      ...collection.migrationStrategies,
      2: passThrough
    }
  };
}

export const collections = {
  authors: upgrade(baseCollections.authors),
  works: upgrade(baseCollections.works),
  editions: upgrade(baseCollections.editions),
  reviews: upgrade(baseCollections.reviews),
  entityresolutions: upgrade(baseCollections.entityresolutions),
  entitylinks: upgrade(baseCollections.entitylinks),
  bookwyrminstances: upgrade(baseCollections.bookwyrminstances),
  searchvectors: upgrade(baseCollections.searchvectors),
  fetchqueue: upgrade(baseCollections.fetchqueue),
  writequeue: upgrade(baseCollections.writequeue)
} as const;
