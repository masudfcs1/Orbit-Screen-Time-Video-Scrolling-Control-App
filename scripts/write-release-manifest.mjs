import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const [kind, ...files] = process.argv.slice(2);
if (!kind || !files.length) throw new Error('Usage: node scripts/write-release-manifest.mjs <kind> <artifact> [...]');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
let commit = null;
try {
  commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch {
  // A downloaded source archive need not have Git metadata.
}
const artifacts = await Promise.all(files.map(async (file) => {
  const info = await stat(file);
  if (!info.isFile() || info.size === 0) throw new Error(`Artifact is not a non-empty file: ${file}`);
  return {
    file: path.basename(file),
    bytes: info.size,
    sha256: createHash('sha256').update(await readFile(file)).digest('hex'),
  };
}));
const destination = path.join(path.dirname(files[0]), `${kind}-manifest.json`);
await writeFile(destination, `${JSON.stringify({ schemaVersion: 1, app: 'Orbit', version: packageJson.version, kind, commit, builtAt: new Date().toISOString(), artifacts }, null, 2)}\n`);
console.log(`Build manifest: ${destination}`);
