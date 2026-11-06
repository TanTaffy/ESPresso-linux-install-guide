import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { releaseFilename } from './distribution.mjs';

const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const filename = releaseFilename(version);
if (!filename)
  throw new Error('No package is defined for this OS/architecture.');
const artifact = path.join('release', filename);
const hash = createHash('sha256')
  .update(fs.readFileSync(artifact))
  .digest('hex');
fs.writeFileSync(`${artifact}.sha256`, `${hash}  ${filename}\n`);
console.log(`Created ${filename}.sha256`);
