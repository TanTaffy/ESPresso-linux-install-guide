import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { releaseFilename } from './distribution.mjs';

const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const tag = process.env.GITHUB_REF_NAME;
if (tag !== `v${version}`)
  throw new Error(`Tag ${tag} does not match v${version}.`);
const gh = (args) =>
  execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
const assets = [
  ['win32', 'x64'],
  ['darwin', 'x64'],
  ['darwin', 'arm64'],
  ['linux', 'x64'],
  ['linux', 'arm64'],
].flatMap(([platform, arch]) => {
  const filename = `release/${releaseFilename(version, platform, arch)}`;
  return [filename, `${filename}.sha256`];
});
for (const filename of assets)
  if (!fs.existsSync(filename)) throw new Error(`Missing package: ${filename}`);
// Check the complete release list rather than treating a failed lookup as permission to create.
const releases = JSON.parse(
  gh([
    'api',
    '--paginate',
    '--slurp',
    `repos/${process.env.GITHUB_REPOSITORY}/releases?per_page=100`,
  ]),
);
const existing = releases.flat().find((release) => release.tag_name === tag);
if (existing && !existing.draft)
  throw new Error(`Release ${tag} is already published.`);
if (!existing) {
  const notes = `releases/${tag}.md`;
  gh([
    'release',
    'create',
    tag,
    '--verify-tag',
    '--draft',
    '--title',
    `ESPresso ${version}`,
    ...(fs.existsSync(notes) ? ['--notes-file', notes] : ['--generate-notes']),
  ]);
}
gh(['release', 'upload', tag, ...assets, '--clobber']);
gh(['release', 'edit', tag, '--draft=false', '--latest']);
console.log(`Published ${tag} with all native packages and checksums.`);
