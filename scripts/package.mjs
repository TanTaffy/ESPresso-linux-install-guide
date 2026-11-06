import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { distribution } from './distribution.mjs';
const require = createRequire(import.meta.url);
const target = distribution();
if (!target)
  throw new Error(`Unsupported package: ${process.platform}/${process.arch}`);
if (process.argv.length > 2)
  throw new Error(
    'Packages must be built on their target OS and architecture.',
  );
const result = spawnSync(
  process.execPath,
  [
    require.resolve('electron-builder/out/cli/cli.js'),
    target.flag,
    target.target,
    `--${process.arch}`,
    '--publish',
    'never',
  ],
  {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_BUILDER_COMPRESSION_LEVEL: '3' },
  },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
