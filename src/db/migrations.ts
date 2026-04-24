export async function runMigrations() {
  // RxDB runs collection migrationStrategies during database initialization.
  const { initializeDatabase } = await import('./client');
  await initializeDatabase();
}
