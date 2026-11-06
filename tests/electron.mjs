import { _electron as electron } from '@playwright/test';
import electronBinary from 'electron';
import path from 'node:path';

export function launchDesktop(options = {}) {
  const env = { ...process.env, ...options.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({
    timeout: 60000,
    ...options,
    executablePath: process.env.ESPRESSO_E2E_BINARY || electronBinary,
    args: [
      // Isolated Linux CI runners cannot set up Electron's setuid sandbox.
      // This applies only to the test launcher, never to the shipped app.
      ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
      ...(process.env.ESPRESSO_E2E_BINARY ? [] : [path.resolve('.')]),
    ],
    env,
  });
}
