import { expect } from '@playwright/test';
import { launchDesktop } from './electron.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-first-program-'));
const editor = path.join(
  root,
  'fake editor',
  process.platform === 'win32' ? 'Code.exe' : 'code',
);
fs.mkdirSync(path.dirname(editor), { recursive: true });
fs.writeFileSync(editor, '#!/bin/sh\n');
fs.chmodSync(editor, 0o755);
const sdk = path.join(root, 'esp-idf');
fs.mkdirSync(path.join(sdk, 'tools'), { recursive: true });
fs.writeFileSync(path.join(sdk, 'tools/idf.py'), '');
const env = {
  ...process.env,
  ESPRESSO_TEST_DATA: path.join(root, 'profile'),
  ESPRESSO_EDITOR: editor,
  IDF_PATH: sdk,
};
delete env.ELECTRON_RUN_AS_NODE;
const app = await launchDesktop({
  cwd: path.resolve('.'),
  env,
});
const page = await app.firstWindow(),
  errors = [];
page.setDefaultTimeout(20000);
page.on('pageerror', (error) => errors.push(error.message));
const tab = (name) =>
  page.locator('.tabs').getByRole('button', { name, exact: true }).click();
try {
  await app.evaluate((_electron, editor) => {
    const cp = process.getBuiltinModule('node:child_process');
    const { EventEmitter } = process.getBuiltinModule('node:events');
    const spawn = cp.spawn;
    globalThis.editorLaunches = [];
    cp.spawn = (file, args, options) => {
      if (file === editor) {
        globalThis.editorLaunches.push({ file, args, options });
        const child = new EventEmitter();
        child.unref = () => {};
        queueMicrotask(() => child.emit('spawn'));
        return child;
      }
      return spawn(file, args, options);
    };
  }, editor);
  await expect(page.locator('.project-label')).toHaveText('New layout');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Project settings', exact: true })
    .click();
  const setup = page.getByRole('dialog', {
    name: 'Project settings',
    exact: true,
  });
  await setup.getByLabel('Project name', { exact: true }).fill('pressure-flow');
  await setup
    .getByLabel('ESP32 target', { exact: true })
    .selectOption('esp32s3');
  await setup
    .getByRole('button', { name: 'Apply settings', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Task Drag onto canvas', exact: true })
    .click();
  await page.getByLabel('Task name', { exact: true }).fill('Pressure sensor');
  await tab('Task steps');
  await expect(
    page.getByRole('button', { name: 'Send data', exact: true }).first(),
  ).toBeDisabled();
  await expect(
    page
      .getByRole('button', { name: 'Send data', exact: true })
      .first()
      .locator('..'),
  ).toHaveAttribute('title', 'Add message data first.');
  await tab('Canvas');
  await page
    .getByLabel('Timing units', { exact: true })
    .selectOption('frequency');
  await page.getByLabel('Task frequency', { exact: true }).fill('10');
  await expect(
    page.getByText('Every 100 ms · 10 Hz.', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Task C++ symbol', { exact: true }),
  ).toBeHidden();
  await page
    .getByRole('button', { name: 'Add output data', exact: true })
    .click();
  await page
    .getByLabel('Struct display name', { exact: true })
    .fill('Pressure');
  await page.getByRole('button', { name: 'Add field', exact: true }).click();
  await page.getByRole('textbox', { name: /^Field name / }).fill('raw_count');
  await expect(
    page.getByRole('spinbutton', { name: /^Array length / }),
  ).toBeHidden();
  await tab('Canvas');
  await page
    .getByRole('button', { name: 'Task Drag onto canvas', exact: true })
    .click();
  await page.getByLabel('Task name', { exact: true }).fill('CAN');
  await page
    .getByLabel('Loop trigger', { exact: true })
    .selectOption({ label: 'When Pressure arrives' });
  await expect(page.getByLabel('Loop period', { exact: true })).toHaveCount(0);
  await expect(page.locator('.inspector')).toContainText(
    'You do not need another receive step',
  );
  await page.getByRole('button', { name: 'Edit CAN', exact: true }).click();
  await page
    .getByRole('button', { name: 'Placeholder', exact: true })
    .last()
    .click();
  await page.getByLabel('Step name', { exact: true }).fill('Handle pressure');
  await tab('Export');
  await expect(page.locator('.export-check')).toContainText('Structure valid');
  await expect(page.locator('.code-heading')).toContainText(
    'main/tasks/can_task.cpp',
  );
  await expect(page.locator('.implementation-review')).toContainText(
    '1 implementation steps',
  );
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, root);
  await page
    .getByRole('button', { name: 'Choose output folder', exact: true })
    .click();
  await expect(page.locator('.export-destination')).toContainText(
    path.join(root, 'pressure-flow'),
  );
  assert.equal(fs.existsSync(path.join(root, 'pressure-flow')), false);
  await page
    .getByRole('button', { name: 'Export skeleton', exact: true })
    .last()
    .click();
  await expect(page.locator('.export-success')).toContainText('pressure-flow');
  await expect(
    page.getByRole('button', { name: 'Copy commands', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.build-guide')).toContainText(
    `ESP-IDF found: ${sdk}`,
  );
  await page
    .getByRole('button', { name: 'Open in VS Code', exact: true })
    .click();
  await expect
    .poll(() => app.evaluate(() => globalThis.editorLaunches.length))
    .toBe(1);
  const launch = await app.evaluate(() => globalThis.editorLaunches[0]);
  assert.equal(launch.file, editor);
  assert.deepEqual(launch.args, [
    '--new-window',
    path.join(root, 'pressure-flow'),
  ]);
  assert.equal(launch.options.shell, false);
  assert.equal(launch.options.windowsHide, true);
  const exported = JSON.parse(
    fs.readFileSync(
      path.join(root, 'pressure-flow/espresso.layout.json'),
      'utf8',
    ),
  );
  const producer = exported.nodes.find((n) => n.name === 'Pressure sensor');
  const pressure = exported.nodes.find((n) => n.name === 'Pressure');
  const consumer = exported.nodes.find((n) => n.name === 'CAN');
  assert.equal(producer.symbol, 'pressure_sensor');
  assert.equal(producer.periodMs, 100);
  assert.equal(pressure.symbol, 'pressure');
  assert.equal(pressure.typeName, 'PressureSample');
  assert.equal(producer.loop[0].name, 'Send Pressure');
  assert.equal(producer.loop[0].localName, 'pressure');
  assert.equal(consumer.trigger, 'queue');
  assert.equal(consumer.queueId, pressure.id);
  assert.equal(consumer.loop.length, 1);
  assert.ok(exported.nodes.every((n) => n.codeNamesLocked));
  await tab('Task steps');
  await page.getByLabel('Task name', { exact: true }).fill('Telemetry');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByLabel('Task name', { exact: true }).fill('Telemetry');
  await page.getByText('Advanced task settings', { exact: true }).click();
  await expect(page.getByLabel('Task C++ symbol', { exact: true })).toHaveValue(
    'can',
  );
  await expect(
    page.getByLabel('Task C++ symbol', { exact: true }),
  ).toBeDisabled();
  await tab('Canvas');
  const boxes = await page.locator('.react-flow__node').evaluateAll((nodes) =>
    nodes.map((n) => {
      const r = n.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }),
  );
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      assert.ok(
        boxes[i].right <= boxes[j].left ||
          boxes[j].right <= boxes[i].left ||
          boxes[i].bottom <= boxes[j].top ||
          boxes[j].bottom <= boxes[i].top,
        'New nodes should not overlap',
      );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1050, 720),
  );
  for (const screen of [
    'Canvas',
    'Task steps',
    'Data',
    'Libraries',
    'Export',
  ]) {
    await tab(screen);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${screen} should fit the minimum window width`,
    );
    const heading = page.locator('.page-heading');
    if (await heading.count()) {
      const bounds = await heading.boundingBox();
      assert.ok(
        bounds.x + bounds.width <= (await page.evaluate(() => innerWidth)) + 1,
      );
    }
    await page.screenshot({
      path: `test-results/minimum-${screen.toLowerCase().replaceAll(' ', '-')}.png`,
    });
  }
  await tab('Canvas');
  fs.mkdirSync('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/first-program-flow.png' });
  await page.getByRole('button', { name: 'New layout', exact: true }).click();
  await page
    .getByRole('button', { name: 'Continue without saving', exact: true })
    .click();
  await expect(page.locator('.project-label')).toHaveText('New layout');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Task Drag onto canvas', exact: true })
    .click();
  await expect(page.locator('.task-node')).toHaveCount(1);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      firstProgramCreationTimingNamesExportAndCodeNameStability: true,
      export: root,
    }),
  );
} finally {
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  await app.close().catch(() => {});
}
