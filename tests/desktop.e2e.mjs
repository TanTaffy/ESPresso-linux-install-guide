import { expect } from '@playwright/test';
import { launchDesktop } from './electron.mjs';
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
const app = await launchDesktop({
  env,
  cwd: root,
  timeout: 30000,
});
const page = await app.firstWindow(),
  errors = [];
page.setDefaultTimeout(20000);
page.on('pageerror', (e) => errors.push(e.message));
const screenshotDir = path.join(root, 'test-results');
fs.mkdirSync(screenshotDir, { recursive: true });
try {
  await page
    .getByRole('button', { name: 'Start new layout', exact: true })
    .click();
  await expect(page.locator('.project-label')).toHaveText('New layout');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await expect(page.locator('.brand img, .sidebar-logo')).toHaveCount(0);
  await expect(page.locator('.brand-name')).toHaveText('ESPresso');
  await expect(page.locator('.brand-version')).toHaveText(
    `v${JSON.parse(fs.readFileSync('package.json', 'utf8')).version}`,
  );
  await expect(page.locator('.status-bar')).toHaveCount(0);
  assert.equal(fs.existsSync(path.join(data, 'recovery.espresso.json')), false);
  await page.screenshot({ path: path.join(screenshotDir, 'new-layout.png') });
  await page
    .getByRole('button', {
      name: 'Task from template Choose a task type',
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: 'Add CAN task', exact: true }).click();
  await expect(page.locator('.task-node')).toHaveCount(1);
  await expect(page.locator('.task-node img.task-custom-icon')).toHaveCount(1);
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
  await page.getByRole('button', { name: 'Edit CAN', exact: true }).click();
  await page.getByRole('button', { name: 'Add setting', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Parameter name 2', exact: true })
    .fill('testval');
  await page
    .getByRole('textbox', { name: 'Parameter value testval', exact: true })
    .fill('3');
  await page
    .locator('.tabs')
    .getByRole('button', { name: 'Config File', exact: true })
    .click();
  await expect(
    page.getByLabel('Config file preview', { exact: true }),
  ).toContainText('namespace Config');
  await expect
    .poll(async () =>
      /TX_GPIO = GPIO_NUM_1;\n        inline constexpr int testval = 3;\n        inline constexpr unsigned PERIOD_MS/.test(
        await page
          .getByLabel('Config file preview', { exact: true })
          .textContent(),
      ),
    )
    .toBe(true);
  await expect(
    page.getByRole('heading', { name: 'config/Config.hpp', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(screenshotDir, 'pressure-board-config.png'),
  });
  await page
    .locator('.tabs')
    .getByRole('button', { name: 'Canvas', exact: true })
    .click();
  const adc = page.getByTestId('node-task-adc');
  await page.waitForFunction(
    () => {
      const node = document.querySelector('[data-testid="node-task-adc"]');
      if (!node) return false;
      const r = node.getBoundingClientRect();
      const position = JSON.stringify([r.x, r.y, r.width, r.height]);
      const previous = window.espressoTaskDragGeometry;
      window.espressoTaskDragGeometry = {
        position,
        frames: previous?.position === position ? previous.frames + 1 : 0,
      };
      return window.espressoTaskDragGeometry.frames >= 6;
    },
    undefined,
    { polling: 'raf' },
  );
  const before = await adc.boundingBox();
  const positionBefore = await adc
    .locator('..')
    .evaluate((node) => node.style.transform);
  const grip = await adc.locator('header .node-type').boundingBox();
  const dragX = grip.x + grip.width / 2,
    dragY = grip.y + grip.height / 2;
  await page.mouse.move(dragX, dragY);
  await page.mouse.down();
  await page.mouse.move(dragX + 45, dragY + 45, { steps: 15 });
  await page.mouse.up();
  await expect
    .poll(() => adc.locator('..').evaluate((node) => node.style.transform))
    .not.toBe(positionBefore);
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
  await expect(page.getByLabel('Timing units', { exact: true })).toHaveValue(
    'interval',
  );
  await expect(page.getByLabel('Loop period', { exact: true })).toHaveValue(
    '100',
  );
  await expect(
    page.getByLabel('Period expression', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('textbox', {
      name: 'Parameter value MOSI_GPIO',
      exact: true,
    }),
  ).toHaveValue('GPIO_NUM_11');
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
    .getByRole('button', { name: 'Data', exact: true })
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
  await page.getByText('Structure valid', { exact: false }).waitFor();
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
    globalThis.saveDialogCalls = 0;
    dialog.showSaveDialog = async () => {
      ++globalThis.saveDialogCalls;
      return { canceled: false, filePath: savePath };
    };
  }, savePath);
  await page.getByRole('button', { name: 'Save layout', exact: true }).click();
  await expect
    .poll(() => fs.existsSync(savePath), { timeout: 20000 })
    .toBe(true);
  const saved = JSON.parse(fs.readFileSync(savePath, 'utf8'));
  assert.equal(saved.nodes[0].periodMs, 50);
  assert.equal(saved.nodes[1].fields.at(-1).name, 'sample_counter');
  assert.ok(saved.nodes[0].position.y > 60);
  if (!liveCan) {
    // Exercise real native folder export without making the ordinary UI suite
    // depend on GitHub availability. The template UI/preview is tested above.
    const fixture = structuredClone(saved);
    for (const node of fixture.nodes)
      if (node.kind === 'task') {
        node.libraryIds = [];
        if (node.symbol === 'can') {
          delete fixture.code[
            `includes-${Buffer.from(node.id).toString('hex')}`
          ];
          delete fixture.code[
            `loopvars-${Buffer.from(node.id).toString('hex')}`
          ];
        }
      }
    const fixturePath = path.join(data, 'offline-export.espresso.json');
    fs.writeFileSync(fixturePath, JSON.stringify(fixture));
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, fixturePath);
    await page
      .getByRole('button', { name: 'Open layout', exact: true })
      .click();
    await page.getByText('Layout opened', { exact: true }).waitFor();
    await page
      .locator('.tabs')
      .getByRole('button', { name: 'Export', exact: true })
      .click();
    await page.getByText('Structure valid', { exact: false }).waitFor();
  }
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, data);
  await page
    .getByRole('button', { name: 'Choose output folder', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Export skeleton', exact: true })
    .nth(1)
    .click();
  await page
    .getByRole('button', { name: 'Open folder', exact: true })
    .waitFor({ timeout: 120000 });
  if (liveCan) {
    const canLock = JSON.parse(
      fs.readFileSync(
        path.join(data, 'pressure-node', 'espresso.libraries.lock.json'),
        'utf8',
      ),
    );
    assert.match(canLock['msm-can'].commit, /^[a-f0-9]{40}$/);
    assert.ok(
      fs.existsSync(
        path.join(
          data,
          'pressure-node',
          'components',
          'MSM_CAN',
          'main/MSM_CAN.cpp',
        ),
      ),
    );
  }
  assert.ok(
    fs.existsSync(path.join(data, 'pressure-node', 'main/tasks/adc_task.cpp')),
  );
  await page
    .getByRole('button', { name: 'Choose output folder', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Export skeleton', exact: true })
    .nth(1)
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
  await page.getByRole('button', { name: 'Open layout', exact: true }).click();
  await page
    .getByRole('button', { name: 'Continue without saving', exact: true })
    .click();
  await page.getByText('Layout opened', { exact: true }).waitFor();
  await page
    .getByRole('button', {
      name: 'Latest value Share a current reading',
      exact: false,
    })
    .click();
  await page.getByText('Data added', { exact: true }).waitFor();
  const structNode = page.locator('.shared-node').last();
  const structId = await structNode.locator('..').getAttribute('data-id');
  // Connect the task's general write handle to the new struct's input.
  const source = page.locator(
    '[data-id="task-can"] .react-flow__handle[data-handleid="write-new"]',
  );
  const target = page.locator(
    `[data-id="${structId}"] .react-flow__handle[data-handleid="write"]`,
  );
  // Adding a node schedules measurement and fitView. Wait for the actual port
  // positions to settle before taking coordinates; the toast precedes that work.
  await expect(source).toBeInViewport();
  await expect(target).toBeInViewport();
  await page.waitForFunction(
    (id) => {
      const ports = [
        document.querySelector(
          '[data-id="task-can"] .react-flow__handle[data-handleid="write-new"]',
        ),
        document.querySelector(
          `[data-id="${id}"] .react-flow__handle[data-handleid="write"]`,
        ),
      ];
      if (ports.some((port) => !port)) return false;
      const positions = JSON.stringify(
        ports.map((port) => {
          const r = port.getBoundingClientRect();
          return [r.x, r.y, r.width, r.height];
        }),
      );
      const previous = window.espressoDragGeometry;
      window.espressoDragGeometry = {
        positions,
        frames: previous?.positions === positions ? previous.frames + 1 : 0,
      };
      return window.espressoDragGeometry.frames >= 6;
    },
    structId,
    { polling: 'raf' },
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
  await expect
    .poll(
      () =>
        JSON.parse(fs.readFileSync(savePath, 'utf8'))
          .nodes.flatMap((node) => node.loop ?? [])
          .some((step) => step.name === 'Keep this placeholder'),
      { timeout: 20000 },
    )
    .toBe(true);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      passed: true,
      savePath,
      exportPath: path.join(data, 'pressure-node'),
      screenshots: screenshotDir,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      files: fs.readdirSync(data),
      pageErrors: errors,
      uiErrors: await page.locator('.error-banner').allTextContents(),
      dialogs: await page.getByRole('dialog').allTextContents(),
      saveDialogCalls: await app.evaluate(() => globalThis.saveDialogCalls),
    }),
  );
  await page.screenshot({
    path: path.join(screenshotDir, 'desktop-failure.png'),
  });
  throw error;
} finally {
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  await app.close().catch(() => {});
}
