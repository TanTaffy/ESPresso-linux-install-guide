import { expect } from '@playwright/test';
import { launchDesktop } from './electron.mjs';
import { releaseFilename } from '../scripts/distribution.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-updates-'));
const env = { ...process.env, ESPRESSO_TEST_DATA: profile };
delete env.ELECTRON_RUN_AS_NODE;
const app = await launchDesktop({
  cwd: path.resolve('.'),
  env,
});
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await app.evaluate(
    ({ ipcMain }, url) => {
      globalThis.updateChecks = 0;
      globalThis.downloadRequests = 0;
      globalThis.updateFailure = false;
      ipcMain.removeHandler('check-updates');
      ipcMain.handle('check-updates', () => {
        ++globalThis.updateChecks;
        if (globalThis.updateFailure) throw Error('offline');
        return {
          version: '9.0.0',
          url,
        };
      });
      ipcMain.removeHandler('download-update');
      ipcMain.handle('download-update', () => {
        ++globalThis.downloadRequests;
      });
    },
    `https://github.com/Trovix/ESPresso/releases/download/v9.0.0/${releaseFilename('9.0.0')}`,
  );
  await page.reload();
  const prompt = page.getByRole('dialog', {
    name: 'A new version is available',
    exact: true,
  });
  await expect(page.locator('.project-label')).toHaveText('New layout');
  await expect.poll(() => app.evaluate(() => globalThis.updateChecks)).toBe(1);
  await expect(prompt).toContainText('ESPresso 9.0.0');
  await expect(
    prompt.getByRole('button', { name: 'Not now', exact: true }),
  ).toBeFocused();
  await prompt.getByRole('button', { name: 'Not now', exact: true }).click();
  await page
    .getByRole('button', { name: 'Task Drag onto canvas', exact: true })
    .click();
  await expect(page.getByLabel('Task name', { exact: true })).toBeVisible();
  await expect(prompt).toHaveCount(0);
  assert.equal(await app.evaluate(() => globalThis.updateChecks), 1);
  assert.equal(await app.evaluate(() => globalThis.downloadRequests), 0);
  await expect
    .poll(() => fs.existsSync(path.join(profile, 'recovery.espresso.json')))
    .toBe(true);
  await page.reload();
  const recovery = page.getByRole('dialog', {
    name: 'Recover previous session?',
    exact: true,
  });
  await expect(recovery).toBeVisible();
  await expect.poll(() => app.evaluate(() => globalThis.updateChecks)).toBe(2);
  await expect(prompt).toHaveCount(0);
  await recovery
    .getByRole('button', { name: 'Recover layout', exact: true })
    .click();
  await expect(prompt).toBeVisible();
  await prompt
    .getByRole('button', { name: 'Download update', exact: true })
    .click();
  await expect(prompt).toHaveCount(0);
  assert.equal(await app.evaluate(() => globalThis.downloadRequests), 1);
  await app.evaluate(() => {
    globalThis.updateFailure = true;
  });
  await page.reload();
  await recovery
    .getByRole('button', { name: 'Recover layout', exact: true })
    .click();
  await expect.poll(() => app.evaluate(() => globalThis.updateChecks)).toBe(3);
  await expect(
    page.getByRole('button', { name: 'Task Drag onto canvas', exact: true }),
  ).toBeVisible();
  await expect(prompt).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({ updatePromptDownloadDismissRecoveryAndOffline: true }),
  );
} finally {
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  await app.close().catch(() => {});
}
