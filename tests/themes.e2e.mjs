import { _electron as electron, expect } from '@playwright/test';
import electronBinary from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-themes-'));
const env = { ...process.env, ESPRESSO_TEST_DATA: data };
delete env.ELECTRON_RUN_AS_NODE;
const preferences = () =>
  JSON.parse(fs.readFileSync(path.join(data, 'appearance.json'), 'utf8'));
let app;
async function launch() {
  return electron.launch({
    executablePath: process.env.ESPRESSO_E2E_BINARY || electronBinary,
    args: process.env.ESPRESSO_E2E_BINARY ? [] : [path.resolve('.')],
    env,
    cwd: path.resolve('.'),
    timeout: 30000,
  });
}
const errors = [];
async function pageFor(app) {
  const page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(e.message));
  page.setDefaultTimeout(15000);
  await expect(page.locator('.project-label')).toHaveText('New layout');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page
    .getByRole('combobox', { name: 'App theme', exact: true })
    .waitFor();
  return page;
}
try {
  app = await launch();
  let page = await pageFor(app);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'latte');
  await page
    .getByRole('button', { name: 'Pressure example', exact: true })
    .click();
  await page.getByRole('button', { name: 'Edit ADC', exact: true }).waitFor();
  const label = await page.locator('.project-label').textContent();
  fs.mkdirSync('test-results', { recursive: true });
  for (const [id, dark] of [
    ['latte', false],
    ['espresso', true],
    ['midnight', true],
    ['paper', false],
    ['stinger', false],
  ]) {
    await page
      .getByRole('combobox', { name: 'App theme', exact: true })
      .selectOption(id);
    await expect(page.locator('html')).toHaveAttribute('data-theme', id);
    await expect(() => expect(preferences().selected).toBe(id)).toPass();
    assert.equal(
      await app.evaluate(({ nativeTheme }) => nativeTheme.shouldUseDarkColors),
      dark,
    );
    const colors = await page.evaluate(() => ({
      bg: getComputedStyle(document.documentElement)
        .getPropertyValue('--background')
        .trim(),
      node: getComputedStyle(document.querySelector('.graph-node'))
        .backgroundColor,
      edge: getComputedStyle(document.querySelector('.react-flow__edge-path'))
        .stroke,
      controls: getComputedStyle(
        document.querySelector('.react-flow__controls-button'),
      ).backgroundColor,
    }));
    assert.ok(colors.node && colors.edge && colors.controls);
    assert.equal(
      (
        await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].getBackgroundColor(),
        )
      ).toLowerCase(),
      colors.bg,
    );
    await page.screenshot({ path: `test-results/theme-${id}.png` });
    if (id === 'midnight') {
      await page
        .getByRole('button', { name: 'Config File', exact: true })
        .click();
      await page.screenshot({ path: 'test-results/theme-dark-config.png' });
      await page.getByRole('button', { name: 'Export', exact: true }).click();
      await page.screenshot({ path: 'test-results/theme-dark-export.png' });
      await page.getByRole('button', { name: 'Canvas', exact: true }).click();
    }
  }
  await page
    .getByRole('combobox', { name: 'App theme', exact: true })
    .selectOption('midnight');
  await page
    .getByRole('button', { name: 'Customise theme', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Theme name', exact: true })
    .fill('Forest');
  for (const [label, color] of [
    ['background', '#17251e'],
    ['panels', '#203329'],
    ['text', '#e5f3e9'],
    ['accent', '#e2b45d'],
    ['shared data', '#7dc7a1'],
  ])
    await page.getByLabel('Theme ' + label, { exact: true }).fill(color);
  await expect(page.locator('html')).toHaveAttribute('data-theme', /^custom-/);
  await page.screenshot({ path: 'test-results/theme-editor.png' });
  const button = await page
    .getByRole('button', { name: 'Save theme', exact: true })
    .boundingBox();
  assert.ok(
    button.y + button.height <= (await page.evaluate(() => innerHeight)),
  );
  await page.getByRole('button', { name: 'Save theme', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(() =>
    expect(preferences().customThemes[0]?.name).toBe('Forest'),
  ).toPass();
  const saved = preferences();
  assert.equal(saved.customThemes[0].palette.background, '#17251e');
  assert.equal(await page.locator('.project-label').textContent(), label);
  await page
    .getByRole('button', { name: 'Customise theme', exact: true })
    .click();
  await page.getByLabel('Theme background', { exact: true }).fill('#ffffff');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--background')
        .trim(),
    ),
    '#17251e',
  );
  assert.deepEqual(preferences(), saved);
  await app.evaluate(({ app }) => app.exit(0));
  await app.close().catch(() => {});
  app = await launch();
  page = await pageFor(app);
  await expect(page.locator('html')).toHaveAttribute(
    'data-theme',
    saved.selected,
  );
  await expect(
    page.getByRole('combobox', { name: 'App theme', exact: true }),
  ).toHaveValue(saved.selected);
  assert.equal(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--background')
        .trim(),
    ),
    '#17251e',
  );
  await page
    .getByRole('button', { name: 'Customise theme', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Theme name', exact: true }),
  ).toHaveValue('Forest');
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Customise theme', exact: true }),
  ).toBeFocused();
  await page
    .getByRole('button', { name: 'Customise theme', exact: true })
    .click();
  await page.getByRole('button', { name: 'Delete theme', exact: true }).click();
  await expect(() => expect(preferences().selected).toBe('latte')).toPass();
  await expect(() =>
    expect(preferences().customThemes.length).toBe(0),
  ).toPass();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1050, 720),
  );
  const bounds = await page.locator('.history-actions').boundingBox();
  assert.ok(bounds.x + bounds.width <= (await page.evaluate(() => innerWidth)));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ presetThemesCustomEditorAndPersistence: true }));
} finally {
  if (app) {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
  }
}
