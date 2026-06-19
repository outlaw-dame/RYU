import { collections as baseCollections } from './schema';
import { moderationCollections } from '../moderation/moderation-schema';

export const CURRENT_SCHEMA_VERSION = 2;

type BaseCollection = (typeof baseCollections)[keyof typeof baseCollections];
type ModerationCollection = (typeof moderationCollections)[keyof typeof moderationCollections];
type AnyCollection = BaseCollection | ModerationCollection;
type RuntimeCollection = Omit<AnyCollection, 'schema' | 'migrationStrategies'> & {
  schema: Omit<AnyCollection['schema'], 'version'> & { version: typeof CURRENT_SCHEMA_VERSION };
  migrationStrategies: Record<number, (doc: unknown) => unknown>;
};

function passThrough(doc: unknown): unknown {
  return doc;
}

function upgrade(collection: AnyCollection): RuntimeCollection {
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

const allBaseCollections = { ...baseCollections, ...moderationCollections };
const entries = Object.entries(allBaseCollections).map(([name, collection]) => [name, upgrade(collection as AnyCollection)]);

export const collections = Object.fromEntries(entries) as Record<keyof typeof allBaseCollections, RuntimeCollection>;
