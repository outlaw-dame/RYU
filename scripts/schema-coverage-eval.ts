import { collections as baseCollections } from '../src/db/schema';
import { collections as runtimeCollections } from '../src/db/runtime-schema';

const baseNames = Object.keys(baseCollections).sort();
const runtimeNames = Object.keys(runtimeCollections).sort();

if (JSON.stringify(baseNames) !== JSON.stringify(runtimeNames)) {
  throw new Error(`Runtime DB collections differ from base DB collections. base=${baseNames.join(',')} runtime=${runtimeNames.join(',')}`);
}

console.log('Runtime schema coverage guardrails passed.');
