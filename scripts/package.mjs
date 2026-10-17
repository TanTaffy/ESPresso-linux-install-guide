import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const result = spawnSync(
  process.execPath,
  [
    require.resolve('electron-builder/out/cli/cli.js'),
    '--win',
    'portable',
    '--x64',
  ],
  {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_BUILDER_COMPRESSION_LEVEL: '3' },
  },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
