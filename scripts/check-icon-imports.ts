/**
 * Guardrail: ensure Phosphor icon imports only appear in the icon layer.
 *
 * Allowed files:
 *   - src/design/icons/AppIcon.tsx
 *   - src/design/icons/iconMap.ts
 *   - src/design/icons/iconTypes.ts
 *   - src/main.tsx (IconContext provider)
 *
 * All other files must use AppIcon via the semantic abstraction.
 * Run: npx tsx scripts/check-icon-imports.ts
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC_DIR = join(import.meta.dirname ?? ".", "..", "src");
const ALLOWED_FILES = new Set([
  "src/design/icons/AppIcon.tsx",
  "src/design/icons/iconMap.ts",
  "src/design/icons/iconTypes.ts",
  "src/main.tsx"
]);

const ICON_IMPORT_PATTERN = /from\s+["']@phosphor-icons\/react/;

function walk(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".git" || entry === "dist") continue;
      results.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

let violations = 0;
const root = join(SRC_DIR, "..");

for (const file of walk(SRC_DIR)) {
  const rel = relative(root, file);
  if (ALLOWED_FILES.has(rel)) continue;

  const content = readFileSync(file, "utf-8");
  if (ICON_IMPORT_PATTERN.test(content)) {
    console.error(`❌ Direct Phosphor import in: ${rel}`);
    console.error(`   Use AppIcon from "../../design/icons/AppIcon" instead.\n`);
    violations++;
  }
}

if (violations > 0) {
  console.error(`\n${violations} file(s) import Phosphor icons directly. Use the AppIcon semantic layer.`);
  process.exit(1);
} else {
  console.log("✅ All icon imports go through the semantic AppIcon layer.");
}
