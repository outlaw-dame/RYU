import { collections, CURRENT_SCHEMA_VERSION } from '../src/db/runtime-schema';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function indexesOf(collectionName: keyof typeof collections): readonly string[] {
  return collections[collectionName].schema.indexes as readonly string[];
}

function migrationKeysOf(collectionName: keyof typeof collections): string[] {
  return Object.keys(collections[collectionName].migrationStrategies);
}

function assertCollectionVersionAndMigration(collectionName: keyof typeof collections): void {
  const collection = collections[collectionName];

  assert(
    collection.schema.version === CURRENT_SCHEMA_VERSION,
    `${collectionName} schema should use current runtime schema version`
  );

  assert(
    typeof collection.migrationStrategies[CURRENT_SCHEMA_VERSION as keyof typeof collection.migrationStrategies] === 'function',
    `${collectionName} should define a migration strategy for current runtime schema version`
  );

  assert(
    migrationKeysOf(collectionName).includes('1'),
    `${collectionName} should retain migration strategy for version 1`
  );
}

function main(): void {
  const collectionNames = Object.keys(collections) as Array<keyof typeof collections>;

  for (const collectionName of collectionNames) {
    assertCollectionVersionAndMigration(collectionName);
  }

  assert(indexesOf('works').includes('authorIds'), 'works schema should index authorIds');
  assert(indexesOf('editions').includes('authorIds'), 'editions schema should index authorIds');

  console.log('Schema migration guardrails passed.');
}

main();
