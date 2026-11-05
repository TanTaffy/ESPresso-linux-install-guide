import { _electron as electron, expect } from '@playwright/test';
import electronBinary from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-recovery-'));
const profile = path.join(data, 'profile');
const recoveryPath = path.join(profile, 'recovery.espresso.json');
const originalPath = path.join(data, 'original.espresso.json');
const copyPath = path.join(data, 'copy.espresso.json');
const env = { ...process.env, ESPRESSO_TEST_DATA: profile };
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const errors = [];
fs.mkdirSync(path.resolve('test-results'), { recursive: true });
async function launch() {
  app = await electron.launch({
    executablePath: process.env.ESPRESSO_E2E_BINARY || electronBinary,
    args: process.env.ESPRESSO_E2E_BINARY ? [] : [path.resolve('.')],
    cwd: path.resolve('.'),
    env,
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => errors.push(error.message));
}
async function stop() {
  if (!app) return;
  // Exit without saving, as when the app or computer stops unexpectedly.
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  await app.close().catch(() => {});
  app = null;
}
async function saveDialog(filePath) {
  await app.evaluate(({ dialog }, destination) => {
    dialog.showSaveDialog = async () =>
      destination
        ? { canceled: false, filePath: destination }
        : { canceled: true };
  }, filePath);
}
const recoveryDialog = () =>
  page.getByRole('dialog', { name: 'Recover previous session?' });
try {
  await launch();
  const setup = page
    .getByRole('dialog')
    .filter({ hasText: 'Start your program' });
  await setup
    .getByLabel('Project name', { exact: true })
    .fill('recovery-check');
  await setup
    .getByRole('button', { name: 'Create program', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Task Drag onto canvas', exact: true })
    .click();
  await page.getByLabel('Task name', { exact: true }).fill('Original task');
  await saveDialog(originalPath);
  await page.getByRole('button', { name: 'Save layout', exact: true }).click();
  await expect(page.getByLabel('Unsaved changes', { exact: true })).toHaveCount(
    0,
  );
  const original = fs.readFileSync(originalPath, 'utf8');
  await page.getByLabel('Task name', { exact: true }).fill('Recovered task');
  await expect
    .poll(() => JSON.parse(fs.readFileSync(recoveryPath, 'utf8')).nodes[0].name)
    .toBe('Recovered task');
  await page
    .getByRole('combobox', { name: 'App theme', exact: true })
    .selectOption('espresso');
  await expect(async () => {
    const appearance = JSON.parse(
      fs.readFileSync(path.join(profile, 'appearance.json'), 'utf8'),
    );
    expect(appearance.selected).toBe('espresso');
  }).toPass({ timeout: 15000 });
  await stop();

  const recovery = fs.readFileSync(recoveryPath, 'utf8');
  await launch();
  await expect(recoveryDialog()).toContainText('recovery-check');
  await expect(recoveryDialog()).toHaveCSS('color', 'rgb(239, 230, 220)');
  await expect(
    recoveryDialog().getByRole('button', {
      name: 'Recover layout',
      exact: true,
    }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(recoveryDialog()).toBeVisible();
  assert.equal(fs.readFileSync(recoveryPath, 'utf8'), recovery);
  await page.screenshot({
    path: path.resolve('test-results/recovery-prompt.png'),
  });
  // Closing before making a choice must preserve the recovery copy.
  await stop();
  assert.equal(fs.readFileSync(recoveryPath, 'utf8'), recovery);
  await launch();
  await recoveryDialog()
    .getByRole('button', { name: 'Recover layout', exact: true })
    .click();
  await expect(page.locator('.task-node')).toContainText('Recovered task');
  await expect(
    page.getByLabel('Unsaved changes', { exact: true }),
  ).toBeVisible();
  assert.equal(fs.readFileSync(originalPath, 'utf8'), original);

  // Cancel Save As, then choose a copy and ensure subsequent Save targets the copy.
  await saveDialog(null);
  await page.getByRole('button', { name: 'Save as…', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Save as…', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByLabel('Unsaved changes', { exact: true }),
  ).toBeVisible();
  assert.equal(fs.existsSync(copyPath), false);
  await saveDialog(copyPath);
  await page.getByRole('button', { name: 'Save as…', exact: true }).click();
  await expect.poll(() => fs.existsSync(copyPath)).toBe(true);
  await expect(page.getByLabel('Unsaved changes', { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByRole('button', { name: 'Edit Recovered task', exact: true })
    .click();
  await page.getByLabel('Task name', { exact: true }).fill('Copy task');
  await page.getByRole('button', { name: 'Save layout', exact: true }).click();
  await expect
    .poll(() => JSON.parse(fs.readFileSync(copyPath, 'utf8')).nodes[0].name)
    .toBe('Copy task');
  assert.equal(fs.readFileSync(originalPath, 'utf8'), original);

  await app.evaluate(({ shell }) => {
    globalThis.issueLinks = [];
    shell.openExternal = async (url) => {
      globalThis.issueLinks.push(url);
    };
  });
  await page
    .getByRole('button', { name: 'Report an issue on GitHub', exact: true })
    .click();
  assert.deepEqual(await app.evaluate(() => globalThis.issueLinks), [
    'https://github.com/Trovix/ESPresso/issues',
  ]);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1050, 720),
  );
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const header = document
          .querySelector('.header-actions')
          .getBoundingClientRect();
        const history = document
          .querySelector('.history-actions')
          .getBoundingClientRect();
        return Math.max(header.right, history.right) <= innerWidth;
      }),
    )
    .toBe(true);
  await page.screenshot({
    path: path.resolve('test-results/release-actions-small-window.png'),
  });
  await stop();

  await launch();
  await recoveryDialog()
    .getByRole('button', { name: 'Start new layout', exact: true })
    .click();
  await expect(
    page.getByRole('dialog').filter({ hasText: 'Start your program' }),
  ).toBeVisible();
  await expect(page.locator('.task-node')).toHaveCount(0);
  assert.equal(fs.existsSync(recoveryPath), false);
  await stop();
  await launch();
  await expect(
    page.getByRole('dialog').filter({ hasText: 'Start your program' }),
  ).toBeVisible();
  await expect(recoveryDialog()).toHaveCount(0);
  await stop();

  // A corrupt recovery copy must survive and must not prevent a fresh start.
  const corrupt = '{ unfinished recovery file';
  fs.writeFileSync(recoveryPath, corrupt);
  await launch();
  await expect(
    page.getByRole('dialog').filter({ hasText: 'Start your program' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Could not recover the previous session',
  );
  const backup = fs
    .readdirSync(profile)
    .find((name) => name.startsWith('recovery-unreadable-'));
  assert.ok(backup);
  assert.equal(fs.readFileSync(path.join(profile, backup), 'utf8'), corrupt);
  await page
    .getByRole('button', { name: 'Task Drag onto canvas', exact: true })
    .click();
  await expect.poll(() => fs.existsSync(recoveryPath)).toBe(true);
  assert.equal(fs.readFileSync(path.join(profile, backup), 'utf8'), corrupt);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ sessionRecoverySaveAsAndIssues: true }));
} finally {
  await stop();
}
