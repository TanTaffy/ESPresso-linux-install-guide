import { spawnSync } from 'node:child_process';
import { packagedApp } from './distribution.mjs';

const env = { ...process.env, ESPRESSO_E2E_BINARY: packagedApp() };
for (const file of ['tests/flow.e2e.mjs', 'tests/project.e2e.mjs']) {
  const result = spawnSync(process.execPath, [file], {
    stdio: 'inherit',
    env,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
