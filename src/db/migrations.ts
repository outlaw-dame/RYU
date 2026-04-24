export async function runMigrations(): Promise<void> {
  // RxDB executes collection migrationStrategies when collections are registered
  // via db.addCollections(). This function remains as a stable explicit hook for
  // future app-level migrations that do not belong to a single collection schema.
}
