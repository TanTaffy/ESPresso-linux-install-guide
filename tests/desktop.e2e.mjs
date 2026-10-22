import { _electron as electron, expect } from '@playwright/test';
import electronBinary from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root = path.resolve('.');
const liveCan = process.env.ESPRESSO_LIVE_CAN === '1';
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-desktop-'));
fs.writeFileSync(
  path.join(data, 'recovery.espresso.json'),
  JSON.stringify({
    version: 1,
    name: 'previous-session',
    target: 'esp32s3',
    nodes: [],
  }),
);
const env = { ...process.env, ESPRESSO_TEST_DATA: data };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  executablePath: process.env.ESPRESSO_E2E_BINARY || electronBinary,
  args: process.env.ESPRESSO_E2E_BINARY ? [] : [root],
  env,
  cwd: root,
  timeout: 30000,
});
const page = await app.firstWindow(),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const screenshotDir = path.join(root, 'test-results');
fs.mkdirSync(screenshotDir, { recursive: true });
try {
  await expect(page.locator('.project-label')).toHaveText('New layout');
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await expect(page.locator('.brand img, .sidebar-logo')).toHaveCount(0);
  await expect(page.locator('.brand')).toHaveText('ESPresso');
  await expect(page.locator('.status-bar')).toHaveCount(0);
  assert.equal(
    JSON.parse(
      fs.readFileSync(path.join(data, 'recovery.espresso.json'), 'utf8'),
    ).name,
    'previous-session',
  );
  await page.screenshot({ path: path.join(screenshotDir, 'new-layout.png') });
  await page
    .getByRole('button', { name: 'CAN task MSM_CAN preset', exact: true })
    .click();
  await expect(page.locator('.task-node')).toHaveCount(1);
  await expect(page.locator('.task-node .bee-mark')).toHaveCount(1);
  await page.getByRole('button', { name: 'Edit CAN', exact: true }).click();
  await expect(
    page.getByRole('button', {
      name: 'Initialise CAN Code placeholder',
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'Pack CAN frame Code placeholder',
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'Transmit frame Code placeholder',
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page
    .locator('.tabs')
    .getByRole('button', { name: 'Canvas', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Pressure example', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Continue without saving', exact: true })
    .click();
  await page.getByTestId('node-task-adc').waitFor();
  await expect
    .poll(async () => {
      const node = await page.getByTestId('node-task-can').boundingBox();
      const canvas = await page.locator('.flow-wrap').boundingBox();
      return (
        !!node &&
        !!canvas &&
        node.x >= canvas.x &&
        node.x + node.width <= canvas.x + canvas.width
      );
    })
    .toBe(true);
  await page.screenshot({ path: path.join(screenshotDir, 'canvas.png') });
  const adc = page.getByTestId('node-task-adc');
  const before = await adc.boundingBox();
  await page.mouse.move(before.x + 120, before.y + 50);
  await page.mouse.down();
  await page.mouse.move(before.x + 165, before.y + 95, { steps: 15 });
  await page.mouse.up();
  const after = await adc.boundingBox();
  assert.ok(after.y > before.y + 20, 'Task should drag on canvas');
  await page.getByRole('button', { name: 'Edit ADC', exact: true }).click();
  await page
    .getByRole('button', {
      name: 'Convert counts to pressure Code placeholder',
      exact: false,
    })
    .click();
  await page
    .getByRole('textbox', { name: 'Step name', exact: true })
    .fill('Calibrate pressure');
  await page
    .getByRole('spinbutton', { name: 'Loop period', exact: true })
    .fill('50');
  await page
    .getByRole('button', { name: 'Placeholder', exact: true })
    .last()
    .click();
  await page
    .getByRole('textbox', { name: 'Step name', exact: true })
    .fill('Log pressure');
  await page
    .getByRole('textbox', { name: 'Implementation note', exact: true })
    .fill('Print the local sample when debugging.');
  await page
    .getByRole('button', { name: 'Move Log pressure up', exact: true })
    .click();
  await page.screenshot({ path: path.join(screenshotDir, 'task-steps.png') });
  await page
    .locator('.tabs')
    .getByRole('button', { name: 'Shared structs', exact: true })
    .click();
  await page.getByRole('button', { name: 'Add field', exact: true }).click();
  const newName = page
    .locator('.fields-table tbody tr')
    .last()
    .locator('input')
    .first();
  await newName.fill('sample_counter');
  await page.screenshot({
    path: path.join(screenshotDir, 'shared-struct.png'),
  });
  await page
    .locator('.tabs')
    .getByRole('button', { name: 'Export', exact: true })
    .click();
  await page.getByText('Ready to export', { exact: false }).waitFor();
  await page
    .getByRole('button', { name: 'main/tasks/adc_task.cpp', exact: true })
    .click();
  assert.match(
    await page.locator('.code-preview pre').textContent(),
    /Calibrate pressure/,
  );
  assert.match(
    await page.locator('.code-preview pre').textContent(),
    /Print the local sample/,
  );
  await page.screenshot({ path: path.join(screenshotDir, 'export.png') });
  const savePath = path.join(data, 'saved.espresso.json');
  await app.evaluate(({ dialog }, savePath) => {
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: savePath,
    });
  }, savePath);
  await page.getByRole('button', { name: 'Save layout', exact: true }).click();
  await page.getByText('Layout saved', { exact: true }).waitFor();
  const saved = JSON.parse(fs.readFileSync(savePath, 'utf8'));
  assert.equal(saved.nodes[0].periodMs, 50);
  assert.equal(saved.nodes[1].fields.at(-1).name, 'sample_counter');
  assert.ok(saved.nodes[0].position.y > 60);
  if (!liveCan) {
    // Exercise real native folder export without making the ordinary UI suite
    // depend on GitHub availability. The preset UI/preview is tested above.
    const fixture = structuredClone(saved);
    for (const node of fixture.nodes)
      if (node.kind === 'task') {
        delete node.preset;
        for (const step of [...node.setup, ...node.loop]) delete step.action;
      }
    const fixturePath = path.join(data, 'offline-export.espresso.json');
    fs.writeFileSync(fixturePath, JSON.stringify(fixture));
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, fixturePath);
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page.getByText('Layout opened', { exact: true }).waitFor();
    await page
      .locator('.tabs')
      .getByRole('button', { name: 'Export', exact: true })
      .click();
    await page.getByText('Ready to export', { exact: false }).waitFor();
  }
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, data);
  await page
    .getByRole('button', { name: 'Choose folder & export', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Open folder', exact: true })
    .waitFor({ timeout: 120000 });
  if (liveCan) {
    const canLock = JSON.parse(
      fs.readFileSync(
        path.join(data, 'pressure-node', 'msm_can.lock.json'),
        'utf8',
      ),
    );
    assert.match(canLock.commit, /^[a-f0-9]{40}$/);
    assert.ok(
      fs.existsSync(
        path.join(
          data,
          'pressure-node',
          'components',
          'MSM_CAN',
          'MSM_CAN.cpp',
        ),
      ),
    );
  }
  assert.ok(
    fs.existsSync(path.join(data, 'pressure-node', 'main/tasks/adc_task.cpp')),
  );
  await page
    .getByRole('button', { name: 'Choose folder & export', exact: true })
    .click();
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').textContent(), /already exists/);
  await page.getByRole('button', { name: 'Dismiss error' }).click();
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, savePath);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.getByText('Layout opened', { exact: true }).waitFor();
  await page
    .getByRole('button', {
      name: 'Shared struct Drag onto canvas',
      exact: false,
    })
    .click();
  await page.getByText('Shared struct added', { exact: true }).waitFor();
  const structNode = page.locator('.shared-node').last();
  const structId = await structNode.locator('..').getAttribute('data-id');
  // Connect the task's general write handle to the new struct's input.
  const source = page.locator(
    '[data-id="task-can"] .react-flow__handle[data-handleid="write-new"]',
  );
  const target = page.locator(
    `[data-id="${structId}"] .react-flow__handle[data-handleid="write"]`,
  );
  const sb = await source.boundingBox(),
    tb = await target.boundingBox();
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.mouse.down();
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, {
    steps: 20,
  });
  await page.mouse.up();
  await page
    .getByText('Publish step added to CAN.loop()', { exact: true })
    .waitFor();
  await expect(page.locator('.react-flow__edge')).toHaveCount(3);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(3);
  // Turning an access step into a placeholder detaches its struct reference.
  await page.getByRole('button', { name: 'Edit CAN', exact: true }).click();
  await page.locator('.edit-step').last().click();
  await page
    .getByRole('combobox', { name: 'Step type', exact: true })
    .selectOption('placeholder');
  await page
    .getByRole('textbox', { name: 'Step name', exact: true })
    .fill('Keep this placeholder');
  await page
    .getByRole('button', { name: 'Canvas', exact: true })
    .first()
    .click();
  await page.getByTestId(`node-${structId}`).locator('h3').click();
  await page
    .getByRole('button', { name: 'Delete selected node', exact: true })
    .click();
  await page.getByRole('button', { name: 'Edit CAN', exact: true }).click();
  await expect(
    page.getByRole('button', {
      name: 'Keep this placeholder Code placeholder',
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save layout', exact: true }).click();
  await page.getByText('Layout saved', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      passed: true,
      savePath,
      exportPath: path.join(data, 'pressure-node'),
      screenshots: screenshotDir,
    }),
  );
} finally {
  await app.close();
}
