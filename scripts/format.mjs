import fs from 'node:fs/promises';
import path from 'node:path';
import * as prettier from 'prettier';

const check = process.argv.includes('--check');
const roots = [
  'src',
  'defaults',
  'examples',
  'electron',
  'scripts',
  'tests',
  '.github',
  'README.md',
  'releases',
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'index.html',
  '.prettierrc.json',
];
const extensions = /\.(tsx?|mjs|css|json|html|md|ya?ml)$/;
let changed = 0;

async function visit(filename) {
  const stat = await fs.stat(filename);
  if (stat.isDirectory()) {
    for (const child of await fs.readdir(filename))
      await visit(path.join(filename, child));
    return;
  }
  if (!extensions.test(filename)) return;
  const source = await fs.readFile(filename, 'utf8');
  const options = await prettier.resolveConfig(filename);
  const result = await prettier.format(source, {
    ...options,
    filepath: filename,
  });
  if (source === result) return;
  changed++;
  if (check) console.error(`Needs formatting: ${filename}`);
  else await fs.writeFile(filename, result, 'utf8');
}

for (const filename of roots) await visit(filename);
console.log(
  check
    ? changed
      ? `${changed} file(s) need formatting.`
      : 'Formatting is consistent.'
    : `Formatted ${changed} file(s).`,
);
if (check && changed) process.exitCode = 1;
