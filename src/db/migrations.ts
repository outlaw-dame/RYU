import { SCHEMA_VERSION, schemaStatements } from "./schema";

export async function runMigrations() {
  // Placeholder until wa-sqlite connection wrapper is wired in Phase 1.5.
  // Keeping the statements imported ensures schema stays visible to typecheck/build.
  void SCHEMA_VERSION;
  void schemaStatements;
}
