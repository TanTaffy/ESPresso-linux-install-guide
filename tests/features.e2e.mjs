import { _electron as electron, expect } from '@playwright/test';
import electronBinary from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-features-'));
const profile = path.join(data, 'profile');
const env = {
  ...process.env,
  ESPRESSO_TEST_DATA: profile,
};
delete env.ELECTRON_RUN_AS_NODE;
const launch = () =>
  electron.launch({
    executablePath: process.env.ESPRESSO_E2E_BINARY || electronBinary,
    args: process.env.ESPRESSO_E2E_BINARY ? [] : [path.resolve('.')],
    cwd: path.resolve('.'),
    env,
  });
let app = await launch(),
  page = await app.firstWindow();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const tab = (name) =>
  page.locator('.tabs').getByRole('button', { name, exact: true }).click();
const shot = (name) =>
  page.screenshot({ path: path.resolve('test-results', name), fullPage: true });
try {
  await app.evaluate(async () => {
    const cp = process.getBuiltinModule('node:child_process');
    const { EventEmitter } = process.getBuiltinModule('node:events');
    const original = cp.spawn;
    globalThis.folderLaunches = [];
    cp.spawn = (file, args, options) => {
      if (file.toLowerCase().endsWith('\\explorer.exe')) {
        globalThis.folderLaunches.push({ file, args, options });
        const child = new EventEmitter();
        child.unref = () => {};
        queueMicrotask(() => child.emit('spawn'));
        return child;
      }
      return original(file, args, options);
    };
  });
  const folder = path.join(data, 'SensorLib');
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, 'SensorLib.hpp'), '#pragma once\n');
  await tab('Libraries');
  await page
    .getByRole('button', { name: 'Open libraries folder', exact: true })
    .click();
  await expect
    .poll(() => app.evaluate(() => globalThis.folderLaunches.length))
    .toBe(1);
  await expect(
    page.getByRole('button', { name: 'Remove library MSM_CAN', exact: true }),
  ).toBeEnabled();
  await page.locator('.library-select').filter({ hasText: 'MSM_CAN' }).click();
  await expect(
    page.getByRole('textbox', { name: 'Library name', exact: true }),
  ).toBeEditable();
  await expect(
    page.getByRole('textbox', { name: 'GitHub repository', exact: true }),
  ).toBeEditable();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, folder);
  await page.getByRole('button', { name: 'Local folder', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Library name', exact: true })
    .fill('SensorLib');
  await page
    .getByRole('checkbox', { name: 'Save library as default', exact: true })
    .check();
  await page.getByRole('button', { name: 'Save library', exact: true }).click();
  await expect(
    page.getByText('Library saved. Assign it under Task steps.', {
      exact: true,
    }),
  ).toBeVisible();
  await tab('Task types');
  await page
    .getByRole('button', { name: 'Open templates folder', exact: true })
    .click();
  await expect
    .poll(() => app.evaluate(() => globalThis.folderLaunches.length))
    .toBe(2);
  const launches = await app.evaluate(() => globalThis.folderLaunches);
  assert.deepEqual(
    launches.map((call) => call.args),
    [[path.join(profile, 'Libraries')], [path.join(profile, 'Task templates')]],
  );
  assert.ok(
    launches.every(
      (call) =>
        call.options.shell === false && call.options.windowsHide === false,
    ),
  );
  await page
    .getByRole('button', { name: 'New task type', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Task type name', exact: true })
    .fill('Sensor');
  await page
    .getByRole('textbox', { name: 'Task type description', exact: true })
    .fill('Read a sensor');
  await page
    .getByRole('textbox', { name: 'Task type icon', exact: true })
    .fill('📡');
  await page
    .getByLabel('Task type icon image', { exact: true })
    .setInputFiles(path.resolve('public/brand/msm-bee.png'));
  await expect(page.locator('.icon-upload img')).toBeVisible();
  await page
    .getByRole('checkbox', { name: 'Template library SensorLib', exact: true })
    .check();
  await page.getByText('Default task settings', { exact: true }).click();
  await page.getByRole('button', { name: 'Add setting', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Parameter name 0', exact: true })
    .fill('sample_count');
  await page
    .locator('.parameter-row')
    .first()
    .getByText('Label & description', { exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Parameter label 0', exact: true })
    .fill('Sample count');
  await page
    .getByRole('textbox', { name: 'Parameter value sample_count', exact: true })
    .fill('8');
  await page.getByText('Persistent task state', { exact: true }).click();
  await page
    .getByRole('textbox', {
      name: 'Template Persistent task state',
      exact: true,
    })
    .fill('static int samples = 0;');
  await page
    .getByRole('button', { name: 'Add loop step', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Template loop step 1 name', exact: true })
    .fill('Take sample');
  await page
    .getByRole('textbox', { name: 'Template loop step 1 code', exact: true })
    .fill('    ++samples;');
  await page.locator('.template-layout').evaluate((el) => {
    el.scrollTop = 0;
  });
  await shot('task-type-editor.png');
  await page
    .getByRole('button', { name: 'Save task type', exact: true })
    .first()
    .click();
  await expect(
    page.getByText('Task type saved to your reusable templates', {
      exact: true,
    }),
  ).toBeVisible();
  assert.equal(
    fs
      .readdirSync(path.join(profile, 'Libraries'))
      .filter((f) => f.endsWith('.json')).length,
    2,
  );
  const templateFolder = path.join(profile, 'Task templates');
  assert.equal(
    fs.readdirSync(templateFolder).filter((f) => f.endsWith('.json')).length,
    2,
  );
  // A user can add files directly, and one invalid file does not hide valid types.
  const dropped = JSON.parse(
    fs.readFileSync(
      path.join(templateFolder, 'can.espresso-task.json'),
      'utf8',
    ),
  );
  dropped.id = 'file-added';
  dropped.name = 'File added task';
  dropped.description = 'Loaded from a dropped file';
  fs.writeFileSync(
    path.join(templateFolder, 'user-added.espresso-task.json'),
    JSON.stringify(dropped),
  );
  fs.writeFileSync(path.join(templateFolder, 'broken.json'), '{invalid');
  await page
    .getByRole('button', { name: 'Refresh templates', exact: true })
    .click();
  await expect(page.locator('.template-list')).toContainText('File added task');
  await expect(page.locator('.catalog-note')).toContainText('broken.json');
  fs.unlinkSync(path.join(templateFolder, 'broken.json'));
  await page.evaluate(() =>
    window.espresso.newDocument({
      version: 1,
      name: 'done',
      target: 'esp32s3',
      nodes: [],
    }),
  );
  await app.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows())
      window.removeAllListeners('close');
  });
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => errors.push(e.message));
  await expect(page.locator('.project-label')).toHaveText('New layout');
  await expect(page.locator('.palette-button')).toHaveCount(4);
  await page
    .getByRole('button', {
      name: 'Task from template Choose a task type',
      exact: true,
    })
    .click();
  await expect(page.getByRole('dialog')).toContainText('CAN');
  await shot('task-template-picker.png');
  await expect(page.getByRole('dialog')).toContainText('File added task');
  await expect(
    page
      .getByRole('button', { name: 'Add Sensor task', exact: true })
      .locator('img'),
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Search task templates', exact: true })
    .fill('sensor');
  await page
    .getByRole('button', { name: 'Add Sensor task', exact: true })
    .click();
  await page.getByRole('button', { name: 'Edit Sensor', exact: true }).click();
  await expect(
    page.getByRole('checkbox', {
      name: 'Give Sensor access to SensorLib',
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    page.getByRole('button', {
      name: /Take sample Code placeholder · Base code/,
    }),
  ).toBeVisible();
  await tab('Canvas');
  await page
    .getByRole('button', { name: 'Queue Typed FIFO messages', exact: true })
    .click();
  await page.locator('.shared-node').getByRole('button').click();
  await page
    .getByRole('textbox', { name: 'Struct display name', exact: true })
    .fill('Commands');
  await page
    .getByRole('spinbutton', { name: 'Queue capacity', exact: true })
    .fill('4');
  await page.getByRole('button', { name: 'Add field', exact: true }).click();
  await page.getByRole('textbox', { name: /^Field name / }).fill('value');
  await tab('Task steps');
  await page
    .getByRole('button', { name: 'Send queue', exact: true })
    .last()
    .click();
  await page
    .getByRole('spinbutton', { name: 'Queue timeout', exact: true })
    .fill('25');
  await page
    .getByRole('combobox', { name: 'Queue failure behaviour', exact: true })
    .selectOption('continue');
  await tab('Canvas');
  await page
    .getByRole('button', { name: 'Task Drag onto canvas', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Task name', exact: true })
    .fill('Consumer');
  await page
    .getByRole('combobox', { name: 'Loop trigger', exact: true })
    .selectOption('queue');
  await page
    .getByRole('combobox', { name: 'Trigger queue', exact: true })
    .selectOption({ label: 'Commands' });
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await page
    .getByRole('button', { name: 'Edit Consumer', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Placeholder', exact: true })
    .last()
    .click();
  await page
    .getByRole('textbox', { name: 'Implementation note', exact: true })
    .fill('Use event.value from the message that woke this loop.');
  await shot('queue-task-editor.png');
  await tab('Canvas');
  await page
    .getByRole('button', { name: 'Task Drag onto canvas', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Task name', exact: true })
    .fill('Worker');
  await page
    .getByRole('combobox', { name: 'Loop trigger', exact: true })
    .selectOption('notification');
  await tab('Task steps');
  await page
    .getByRole('combobox', { name: 'Select task', exact: true })
    .selectOption({ label: 'Sensor task' });
  await page
    .getByRole('button', { name: 'Notify task', exact: true })
    .last()
    .click();
  await expect(
    page.getByRole('combobox', { name: 'Notification target', exact: true }),
  ).toHaveValue(/.+/);
  await tab('Data types');
  await page
    .getByRole('button', { name: 'Add data type', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Data type name', exact: true })
    .fill('Reading');
  await page.getByRole('button', { name: 'Add field', exact: true }).click();
  await page.getByRole('textbox', { name: /^Field name/ }).fill('raw');
  await page.getByRole('spinbutton', { name: /^Array length/ }).fill('8');
  await shot('data-type-editor.png');
  await tab('Shared structs');
  await page
    .getByRole('combobox', { name: 'Select shared struct', exact: true })
    .selectOption({ label: 'Commands' });
  await page
    .getByRole('combobox', { name: 'Data delivery', exact: true })
    .selectOption('mailbox');
  await page
    .getByRole('combobox', { name: 'Payload definition', exact: true })
    .selectOption({ label: 'Reading (struct)' });
  await shot('mailbox-editor.png');
  await tab('Task steps');
  await page
    .getByRole('combobox', { name: 'Select task', exact: true })
    .selectOption({ label: 'Consumer task' });
  await page
    .getByRole('combobox', { name: 'Loop trigger', exact: true })
    .selectOption('queues');
  await page
    .getByRole('checkbox', { name: 'Trigger on Commands', exact: true })
    .check();
  await page.getByRole('button', { name: 'Add setting', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Parameter name 0', exact: true })
    .fill('SPI_PIN');
  await page
    .getByRole('textbox', { name: 'Parameter value SPI_PIN', exact: true })
    .fill('11');
  await tab('Config File');
  await expect(
    page.getByLabel('Config file preview', { exact: true }),
  ).toContainText('SPI_PIN = 11');
  const generated = await page
    .getByLabel('Config file preview', { exact: true })
    .textContent();
  assert.match(generated, /SPI_PIN = 11/);
  await expect(page.getByRole('textbox')).toHaveCount(0);
  const source =
    generated +
    '\n// Preserve all declarations.\nnamespace BoardConfig { inline constexpr int period = 20; struct Extra { int value; }; }\n#define FEATURE_ENABLED true\n';
  const headerFile = path.join(data, 'BoardConfig.hpp');
  fs.writeFileSync(headerFile, source);
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, headerFile);
  await page
    .getByRole('button', { name: 'Import config file', exact: true })
    .click();
  await expect(
    page.getByLabel('Config file preview', { exact: true }),
  ).toHaveText(source);
  await shot('project-headers.png');
  await tab('Task steps');
  await page
    .getByRole('combobox', { name: 'Select task', exact: true })
    .selectOption({ label: 'Sensor task' });
  await page
    .getByRole('textbox', { name: 'Period expression', exact: true })
    .fill('BoardConfig::period');
  await tab('Export');
  await page
    .getByRole('textbox', { name: 'Project name', exact: true })
    .fill('feature-project');
  await expect(page.locator('.export-check')).toContainText('Ready to export');
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, data);
  await page
    .getByRole('button', { name: 'Choose folder & export', exact: true })
    .click();
  await expect(page.locator('.export-success')).toContainText(
    'feature-project',
  );
  const output = path.join(data, 'feature-project');
  assert.match(
    fs.readFileSync(path.join(output, 'main/tasks/custom_task.cpp'), 'utf8'),
    /\+\+samples/,
  );
  assert.ok(
    fs.existsSync(path.join(output, 'components/SensorLib/SensorLib.hpp')),
  );
  const layout = JSON.parse(
    fs.readFileSync(path.join(output, 'espresso.layout.json'), 'utf8'),
  );
  assert.equal(
    layout.nodes.find((n) => n.name === 'Commands').delivery,
    'mailbox',
  );
  assert.equal(
    layout.nodes.find((n) => n.name === 'Consumer').trigger,
    'queues',
  );
  const external =
    fs
      .readFileSync(path.join(output, 'main/config/BoardConfig.hpp'), 'utf8')
      .replace('PERIOD_MS = BoardConfig::period', 'PERIOD_MS = 50')
      .replace('STACK_BYTES = 4096', "STACK_BYTES = 8'192")
      .replace('PRIORITY = 2', 'PRIORITY = 5')
      .replace('CORE_AFFINITY = -1', 'CORE_AFFINITY = 0') +
    "// Added outside ESPresso\nnamespace Config::custom { inline constexpr uint32_t SPI_CLOCK_HZ = 4'000'000; }\n";
  fs.writeFileSync(path.join(output, 'main/config/BoardConfig.hpp'), external);
  fs.mkdirSync(path.join(output, 'main/drivers'));
  fs.writeFileSync(
    path.join(output, 'main/drivers/notes.txt'),
    'Keep my implementation notes.\n',
  );
  await app.evaluate(
    ({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    },
    path.join(output, 'espresso.project.json'),
  );
  await page
    .getByRole('button', { name: 'Import project', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Continue without saving', exact: true })
    .click();
  await expect(
    page.getByText('Project imported. Code preserved as a snapshot.', {
      exact: true,
    }),
  ).toBeVisible();
  await tab('Config File');
  await expect(
    page.getByLabel('Config file preview', { exact: true }),
  ).toHaveText(external);
  await tab('Task steps');
  await page
    .getByRole('combobox', { name: 'Select task', exact: true })
    .selectOption({ label: 'Sensor task' });
  await expect(
    page.getByRole('spinbutton', { name: 'Loop period', exact: true }),
  ).toHaveValue('50');
  await expect(
    page.getByRole('spinbutton', { name: 'Stack size', exact: true }),
  ).toHaveValue('8192');
  await expect(
    page.getByRole('spinbutton', { name: 'Task priority', exact: true }),
  ).toHaveValue('5');
  await expect(
    page.getByRole('combobox', { name: 'Core affinity', exact: true }),
  ).toHaveValue('0');
  await expect(
    page.getByRole('textbox', {
      name: 'Parameter value SPI_CLOCK_HZ',
      exact: true,
    }),
  ).toHaveValue("4'000'000");
  await page
    .getByRole('textbox', { name: 'Parameter value SPI_CLOCK_HZ', exact: true })
    .fill("2'000'000");
  await tab('Canvas');
  await page
    .getByRole('button', { name: 'Task Drag onto canvas', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Task name', exact: true })
    .fill('GPS');
  await page
    .getByRole('textbox', { name: 'Task C++ symbol', exact: true })
    .fill('gps');
  await page.getByRole('button', { name: 'Add setting', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Parameter name 0', exact: true })
    .fill('BAUD_RATE');
  await page
    .getByRole('textbox', { name: 'Parameter value BAUD_RATE', exact: true })
    .fill('9600');
  await tab('Config File');
  await expect(
    page.getByLabel('Config file preview', { exact: true }),
  ).toContainText('namespace Config::gps');
  await expect(
    page.getByLabel('Config file preview', { exact: true }),
  ).toContainText("SPI_CLOCK_HZ = 2'000'000");
  await shot('config-file-roundtrip.png');
  const next = path.join(data, 'reexport');
  fs.mkdirSync(next);
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, next);
  await tab('Export');
  await expect(page.locator('.export-check')).toContainText('Ready to export');
  await page
    .getByRole('button', { name: 'Choose folder & export', exact: true })
    .click();
  await expect
    .poll(() =>
      fs.existsSync(path.join(next, 'feature-project/main/tasks/gps_task.cpp')),
    )
    .toBe(true);
  assert.equal(
    fs.readFileSync(
      path.join(next, 'feature-project/main/drivers/notes.txt'),
      'utf8',
    ),
    'Keep my implementation notes.\n',
  );
  assert.match(
    fs.readFileSync(
      path.join(next, 'feature-project/main/config/BoardConfig.hpp'),
      'utf8',
    ),
    /BAUD_RATE = 9600/,
  );
  assert.deepEqual(errors, []);
  // Prevent the test shutdown from opening an unsaved-layout dialog.
  await page.evaluate(() =>
    window.espresso.newDocument({
      version: 1,
      name: 'done',
      target: 'esp32s3',
      nodes: [],
    }),
  );
  console.log(
    JSON.stringify({ reusableTemplatesQueuesAndConfig: true, output }),
  );
} finally {
  await app
    .evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows())
        window.removeAllListeners('close');
    })
    .catch(() => {});
  await app.close();
}
