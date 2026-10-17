import { readFile } from 'node:fs/promises';

const tag = process.argv[2];
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const { expo } = JSON.parse(await readFile(new URL('../app.json', import.meta.url), 'utf8'));
if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag ?? '')) {
  throw new Error('Release tag must be a semantic version such as v1.0.0.');
}
if (tag !== `v${packageJson.version}`) {
  throw new Error(`Tag ${tag} must match package.json version v${packageJson.version}. Update the app version and native build numbers before tagging.`);
}
if (expo.version !== packageJson.version) {
  throw new Error('app.json expo.version must match package.json version.');
}
if (!Number.isSafeInteger(expo.android?.versionCode) || expo.android.versionCode < 1) {
  throw new Error('Set a positive integer expo.android.versionCode before releasing.');
}
if (!/^\d+(?:\.\d+){0,2}$/.test(expo.ios?.buildNumber ?? '')) {
  throw new Error('Set expo.ios.buildNumber before releasing.');
}
console.log(`Verified release version ${tag}`);
