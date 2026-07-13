import { cpSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, '..', '..', 'contract', 'src', 'managed', 'private_voting');
const destination = path.resolve(here, '..', 'public', 'zk', 'private_voting');

if (!existsSync(source)) {
  console.error(`Compiled contract not found at ${source}. Run "npm run compact" in the contract workspace first.`);
  process.exit(1);
}

rmSync(destination, { recursive: true, force: true });
cpSync(source, destination, { recursive: true });
console.log(`Copied ZK assets from ${source} to ${destination}`);
