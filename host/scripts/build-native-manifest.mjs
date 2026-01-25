import fs from 'node:fs';
import path from 'node:path';

const [extensionId, hostPath, outPath] = process.argv.slice(2);
if (!extensionId || !hostPath || !outPath) {
  console.error('Usage: node build-native-manifest.mjs <extensionId> <hostPath> <outPath>');
  process.exit(1);
}

const templatePath = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
  'native-messaging',
  'manifest.template.json'
);
const template = fs.readFileSync(templatePath, 'utf8');
const output = template
  .replace(/__AGEAF_EXTENSION_ID__/g, extensionId)
  .replace(/__AGEAF_HOST_PATH__/g, hostPath.replace(/\\/g, '\\\\'));

fs.writeFileSync(outPath, output);
